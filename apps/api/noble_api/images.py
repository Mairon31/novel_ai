"""On-demand ComfyUI image generation for the *current* story scene.

No GPU runtime is loaded at Noble AI startup. The application only connects
to an already running local ComfyUI service when the user checks available
models or explicitly requests an illustration.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import secrets
import time
import uuid

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

from .media import MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS
from .narrative import NarrativeService, validate_endpoint
from .resource_policy import ResourceController
from .comfy_loras import selected_character_loras, validate_lora_inventory


class ImageSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = "comfyui"
    base_url: str = "http://127.0.0.1:8188"
    checkpoint: str = Field(default="", max_length=240)
    width: int = Field(default=768, ge=256, le=1536, multiple_of=64)
    height: int = Field(default=512, ge=256, le=1536, multiple_of=64)
    steps: int = Field(default=22, ge=1, le=70)
    cfg: float = Field(default=7.0, ge=1, le=20)
    negative_prompt: str = Field(default="low quality, distorted, text, watermark", max_length=1000)


class SceneIllustration(BaseModel):
    prompt: str = Field(min_length=8, max_length=2400)
    seed: int | None = Field(default=None, ge=0, le=2**53 - 1)
    reference_asset_id: uuid.UUID | None = None
    denoise: float = Field(default=0.62, ge=0.2, le=0.95)
    allow_low_vram: bool = False
    apply_character_loras: bool = False


def workflow(settings: dict, prompt: str, seed: int,
             reference_name: str | None = None, denoise: float = 0.62,
             lora_stack: list[dict] | None = None) -> dict:
    """Standard ComfyUI workflow with optional ordered LoraLoader chain."""
    model = settings["checkpoint"]
    nodes = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": model}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {
            "text": settings["negative_prompt"], "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {
            "width": settings["width"], "height": settings["height"], "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": settings["steps"], "cfg": settings["cfg"],
            "sampler_name": "euler", "scheduler": "normal",
            "denoise": denoise if reference_name else 1,
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["9", 0] if reference_name else ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {
            "samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {
            "filename_prefix": "NobleAI-Scene", "images": ["6", 0]}},
    }
    if reference_name:
        nodes["8"] = {"class_type": "LoadImage", "inputs": {"image": reference_name}}
        nodes["9"] = {"class_type": "VAEEncode", "inputs": {
            "pixels": ["8", 0], "vae": ["1", 2]}}
        nodes.pop("4")
    model_port = ["1", 0]
    clip_port = ["1", 1]
    for index, item in enumerate(lora_stack or []):
        node_id = str(10 + index)
        nodes[node_id] = {"class_type": "LoraLoader", "inputs": {
            "model": model_port, "clip": clip_port,
            "lora_name": item["lora_name"],
            "strength_model": item["strength"],
            "strength_clip": item["strength"],
        }}
        model_port, clip_port = [node_id, 0], [node_id, 1]
    nodes["2"]["inputs"]["clip"] = clip_port
    nodes["3"]["inputs"]["clip"] = clip_port
    nodes["5"]["inputs"]["model"] = model_port
    return nodes


def resized_reference_png(raw: bytes, width: int, height: int) -> bytes:
    """Normalize a story-owned WebP into a deterministic core LoadImage input."""
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        source = ImageOps.exif_transpose(source).convert("RGB")
        image = ImageOps.fit(source, (width, height), Image.Resampling.LANCZOS)
        data = io.BytesIO()
        image.save(data, format="PNG")
        return data.getvalue()


def save_webp(data: bytes, target) -> None:
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("La imagen obtenida excede el límite de 12 MB")
    try:
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("ComfyUI devolvió una imagen no admitida")
            if original.width * original.height > MAX_IMAGE_PIXELS:
                raise ValueError("Demasiados píxeles")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".webp.part")
            try:
                image.save(temporary, "WEBP", quality=88, method=5)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValueError("La respuesta no contiene una imagen válida") from exc


class SceneImageService:
    def __init__(self, narrative: NarrativeService,
                 transport: httpx.AsyncBaseTransport | None = None,
                 resources: ResourceController | None = None):
        self.narrative = narrative
        self.transport = transport
        self.resources = resources
        self.lock = asyncio.Lock()
        with narrative.store._conn() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS image_preferences (
                id INTEGER PRIMARY KEY CHECK(id=1), config_json TEXT NOT NULL)""")
            conn.execute("INSERT OR IGNORE INTO image_preferences VALUES (1,?)",
                         (ImageSettings().model_dump_json(),))

    def config(self) -> dict:
        with self.narrative.store._conn() as conn:
            raw = conn.execute("SELECT config_json FROM image_preferences WHERE id=1").fetchone()[0]
        return ImageSettings.model_validate_json(raw).model_dump()

    def configure(self, settings: ImageSettings) -> dict:
        if settings.provider != "comfyui":
            raise ValueError("Proveedor de imagen no admitido")
        data = settings.model_dump()
        data["base_url"] = validate_endpoint(data["base_url"])
        if data["width"] * data["height"] > 1_572_864:
            raise ValueError("La resolución excede el presupuesto de esta versión")
        with self.narrative.store._conn() as conn:
            conn.execute("UPDATE image_preferences SET config_json=? WHERE id=1",
                         (json.dumps(data),))
        return data

    async def status(self) -> dict:
        config = self.config()
        try:
            async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                    timeout=8) as client:
                response = await client.get(config["base_url"] + "/models/checkpoints",
                                            follow_redirects=False)
                response.raise_for_status()
                values = response.json()
            if not isinstance(values, list) or not all(isinstance(x, str) for x in values):
                raise ValueError("Catálogo de checkpoints inválido")
            return {"online": True, "provider": "comfyui",
                    "checkpoints": values[:300], "error": None}
        except (httpx.HTTPError, ValueError) as exc:
            return {"online": False, "provider": "comfyui",
                    "checkpoints": [], "error": str(exc)[:180]}

    async def lora_status(self) -> dict:
        """Discover installed LoRAs only on an explicit user or generation call."""
        config = self.config()
        try:
            async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                    timeout=8) as client:
                response = await client.get(config["base_url"] + "/models/loras",
                                            follow_redirects=False)
                response.raise_for_status()
                names = validate_lora_inventory(response.json())
            return {"online": True, "loras": names, "error": None}
        except (httpx.HTTPError, ValueError) as exc:
            return {"online": False, "loras": [], "error": str(exc)[:180]}

    async def validate_lora_nodes(self) -> None:
        config = self.config()
        try:
            async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                    timeout=8) as client:
                response = await client.get(config["base_url"] + "/object_info/LoraLoader",
                                            follow_redirects=False)
                response.raise_for_status()
                registry = response.json()
                node = registry.get("LoraLoader") if isinstance(registry, dict) else None
                required = (node.get("input", {}).get("required")
                            if isinstance(node, dict) else None)
                expected = {"model", "clip", "lora_name", "strength_model", "strength_clip"}
                if not isinstance(required, dict) or not expected.issubset(required):
                    raise ValueError("Nodo ComfyUI LoraLoader no disponible o incompatible")
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(422, "No se pudo validar LoraLoader: " +
                                str(exc)[:160]) from exc

    async def illustrate(self, story_id: str, request: SceneIllustration) -> dict:
        story = self.narrative.get_story(story_id)
        if not story:
            raise HTTPException(404, "Historia no encontrada")
        if self.lock.locked():
            raise HTTPException(409, "ComfyUI ya está generando una ilustración")
        await self.lock.acquire()
        lease = False
        try:
            config = self.config()
            if not config["checkpoint"]:
                raise HTTPException(422, "Selecciona un checkpoint ComfyUI en Ajustes de imagen")
            seed = request.seed if request.seed is not None else secrets.randbelow(2**53)
            planner = self.narrative.visual.planner
            visual_prompt = (planner.prompt(story_id, request.prompt)
                             if planner is not None else
                             self.narrative.visual.enriched_prompt(story_id, request.prompt))
            reference_id = (str(request.reference_asset_id) if request.reference_asset_id
                            else planner.automatic_reference(story_id)
                            if planner is not None else None)
            reference = None
            reference_digest = None
            if reference_id:
                try:
                    reference, reference_digest = self.narrative.visual.reference_bytes(
                        story_id, reference_id)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
            lora_stack = []
            if request.apply_character_loras:
                try:
                    lora_stack = selected_character_loras(
                        self.narrative.visual, story_id, request.prompt)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
                if not lora_stack:
                    raise HTTPException(422,
                        "No hay LoRAs configurados para los personajes presentes")
            active_scene = self.narrative.visual.scene(story_id)
            signature_parts = {
                "scene_id": active_scene["id"], "prompt": visual_prompt,
                "config": config, "seed": seed, "workflow_version": "comfy-native-v2",
                "reference_sha256": reference_digest,
                "denoise": request.denoise if reference is not None else None,
            }
            # Preserve pre-LoRA signatures for existing scenes and offline caches.
            if lora_stack:
                signature_parts["workflow_version"] = "comfy-native-v3-lora"
                signature_parts["lora_stack"] = lora_stack
            signature = hashlib.sha256(json.dumps(
                signature_parts, ensure_ascii=False, sort_keys=True
            ).encode("utf-8")).hexdigest()
            started = time.monotonic()
            # If the user supplied a deterministic seed, an identical image
            # is already available without starting the diffusion provider.
            if request.seed is not None:
                hit = self.narrative.visual.cached(story_id, signature)
                if hit:
                    self.narrative.visual.choose(story_id, hit["id"])
                    return {"story": self.narrative.get_story(story_id),
                            "asset_id": hit["id"], "reference_asset_id": reference_id,
                            "seed": seed,
                            "checkpoint": config["checkpoint"],
                            "applied_loras": lora_stack,
                            "duration_ms": round((time.monotonic()-started)*1000, 1),
                            "cached": True}
            if self.resources is not None:
                # Only on explicit, uncached requests; runs nvidia-smi off
                # the event loop and never stops someone else's LLM process.
                await asyncio.to_thread(self.resources.allow_image_request,
                                        request.allow_low_vram)
                lease = await self.resources.claim_local_gpu("ComfyUI")
            connected = await self.status()
            if not connected["online"]:
                raise HTTPException(503, "ComfyUI no está disponible")
            if config["checkpoint"] not in connected["checkpoints"]:
                raise HTTPException(422, "El checkpoint seleccionado ya no está disponible")
            if lora_stack:
                installed = await self.lora_status()
                if not installed["online"]:
                    raise HTTPException(503,
                        "No se pudo consultar LoRAs instalados en ComfyUI: " +
                        str(installed["error"]))
                missing = [entry["lora_name"] for entry in lora_stack
                           if entry["lora_name"] not in installed["loras"]]
                if missing:
                    raise HTTPException(422,
                        "LoRA no instalado en ComfyUI: " + ", ".join(missing))
                await self.validate_lora_nodes()
            async with httpx.AsyncClient(
                    transport=self.transport, trust_env=False,
                    timeout=httpx.Timeout(25, connect=5)) as client:
                reference_name = None
                if reference is not None:
                    reference_png = resized_reference_png(
                        reference, config["width"], config["height"])
                    uploaded = await client.post(
                        config["base_url"] + "/upload/image",
                        files={"image": ("NobleAI-Reference.png", reference_png, "image/png")},
                        data={"type": "input", "overwrite": "false"},
                        follow_redirects=False)
                    uploaded.raise_for_status()
                    meta = uploaded.json()
                    reference_name = meta.get("name") if isinstance(meta, dict) else None
                    if not isinstance(reference_name, str) or not re.fullmatch(
                            r"[a-zA-Z0-9_.-]{1,180}", reference_name):
                        raise HTTPException(502, "ComfyUI devolvió una referencia de imagen inválida")
                response = await client.post(config["base_url"] + "/prompt",
                    json={"prompt": workflow(config, visual_prompt, seed,
                        reference_name, request.denoise, lora_stack),
                          "client_id": str(uuid.uuid4())}, follow_redirects=False)
                response.raise_for_status()
                ident = response.json().get("prompt_id")
                if not isinstance(ident, str):
                    raise HTTPException(502, "ComfyUI no devolvió el ID de generación")
                # Poll only this prompt: never read or expose another user's images.
                image_ref = None
                for _ in range(180):
                    history = await client.get(
                        config["base_url"] + "/history/" + ident,
                        follow_redirects=False)
                    history.raise_for_status()
                    record = history.json().get(ident)
                    if isinstance(record, dict):
                        if (record.get("status") or {}).get("status_str") == "error":
                            raise HTTPException(502, "ComfyUI falló al ejecutar el workflow")
                        images = (record.get("outputs") or {}).get("7", {}).get("images") or []
                        if images:
                            image_ref = images[0]
                            break
                    await asyncio.sleep(1)
                if image_ref is None:
                    raise HTTPException(504, "ComfyUI no terminó antes del límite de 180 segundos")
                # ComfyUI files are fetched from our validated loopback endpoint only.
                # Do not read or trust any local paths returned by the provider.
                name = image_ref.get("filename") if isinstance(image_ref, dict) else None
                if not isinstance(name, str) or not name or len(name) > 255:
                    raise HTTPException(502, "ComfyUI no devolvió un archivo válido")
                view = await client.get(config["base_url"] + "/view", params={
                    "filename": name, "subfolder": image_ref.get("subfolder", ""),
                    "type": image_ref.get("type", "output")}, follow_redirects=False)
                view.raise_for_status()
                gallery = self.narrative.visual.publish(
                    story_id, view.content, origin="comfyui",
                    prompt=visual_prompt, checkpoint=config["checkpoint"], seed=seed,
                    render_signature=signature,
                    render_details={"workflow_version": (
                        "comfy-native-v3-lora" if lora_stack else "comfy-native-v2"),
                        "loras": lora_stack})
            return {"story": self.narrative.get_story(story_id),
                    "asset_id": gallery["selected_asset_id"],
                    "reference_asset_id": reference_id,
                    "seed": seed, "checkpoint": config["checkpoint"],
                    "applied_loras": lora_stack,
                    "duration_ms": round((time.monotonic() - started) * 1000, 1),
                    "cached": False}
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, "Error de ComfyUI: " + str(exc)[:180]) from exc
        finally:
            if self.resources is not None:
                self.resources.release_local_gpu(lease)
            self.lock.release()


def mount_image_routes(app, images: SceneImageService):
    @app.get("/api/v1/images/config")
    def image_config():
        return images.config()

    @app.put("/api/v1/images/config")
    def update_image_config(body: ImageSettings):
        try:
            return images.configure(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/images/status")
    async def image_status():
        return await images.status()

    @app.get("/api/v1/images/loras")
    async def image_loras():
        return await images.lora_status()

    @app.post("/api/v1/stories/{story_id}/illustrate")
    async def illustrate(story_id: uuid.UUID, body: SceneIllustration):
        return await images.illustrate(str(story_id), body)
