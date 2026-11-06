"""Reviewable, opt-in ComfyUI expression drafts for Creator Studio.

Five independent portrait renders, one per manual request, are kept outside
published story-assets. Each is alpha-extracted and quality-gated; the author
must explicitly approve *all five* before the existing atomic sheet importer
registers sprites. Drafts are resumable across browser/restart and expire in 48h.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import secrets
import shutil
import time
import uuid
from pathlib import Path
from typing import Literal

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

from .comfy_loras import LORA_FILENAME
from .comfy_runtime import render as render_comfy
from .comfy_identity_adapter import (
    DEFAULT_PRESET, PRESETS, identity_adapter_status, inject_ipadapter,
    require_ipadapter_status,
)
from .reference_preparation import identity_reference_png
from .creator_media import (CreatorMediaService, EXPRESSIONS,
                            MAX_MEDIA_BYTES, validate_pose)
from .images import SceneImageService, resized_reference_png, workflow
from .sprite_cutout import transparent_sprite
from .sprite_provenance import normalize_sprite_generation
from .sprite_alignment import geometry_from_png, silhouette_geometry, alignment_warnings

DRAFT_TTL = 48 * 60 * 60
MAX_DRAFTS_PER_STORY = 3
EXPRESSION_GUIDES = {
    "neutral": "calm neutral expression, relaxed mouth, eyes open",
    "joy": "joyful natural smile, happy eyes, relaxed cheerful face",
    "anger": "clearly angry eyebrows, determined frown, intense expression",
    "sadness": "sad expression, downcast eyes, lips gently turned down",
    "surprise": "genuinely surprised face, widened eyes, slightly open mouth",
}
DraftExpression = Literal["neutral", "joy", "anger", "sadness", "surprise"]


class NewSpriteDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: str = Field(min_length=3, max_length=220)
    pose: str = Field(default="standing", min_length=1, max_length=32)
    style: str = Field(default="clean anime visual novel art", max_length=220)
    seed: int | None = Field(default=None, ge=0, le=2**53 - 1)
    reference_asset_id: uuid.UUID | None = None
    reference_sprite_asset_id: uuid.UUID | None = None
    reference_mode: Literal["img2img", "ipadapter"] = "img2img"
    ipadapter_preset: Literal[
        "STANDARD (medium strength)", "PLUS (high strength)",
        "PLUS FACE (portraits)"] = DEFAULT_PRESET
    ipadapter_weight: float = Field(default=0.7, ge=0.1, le=1.5)
    use_lora: bool = False
    denoise: float = Field(default=0.77, ge=0.5, le=0.9)


class SpriteStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allow_low_vram: bool = False


class ApproveSpriteDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accept_alignment_warnings: bool = False


class SpriteDraftService:
    def __init__(self, media: CreatorMediaService, images: SceneImageService):
        self.media = media
        self.images = images
        self.store = media.store
        self.active: str | None = None
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sprite_drafts(
                    id TEXT PRIMARY KEY,
                    story_id TEXT NOT NULL,
                    character_id TEXT NOT NULL,
                    settings_json TEXT NOT NULL,
                    slots_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS sprite_drafts_story
                ON sprite_drafts(story_id,created_at);
            """)

    def _folder(self, story_id: str, draft_id: str) -> Path:
        try:
            if (str(uuid.UUID(story_id)) != story_id or
                    str(uuid.UUID(draft_id)) != draft_id):
                raise ValueError("UUID de borrador no canónico")
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError("Identificador de borrador inválido") from exc
        root = self.store.root.resolve()
        base = root / "sprite-drafts"
        story_dir = base / story_id
        dest = story_dir / draft_id
        if (base.is_symlink() or story_dir.is_symlink() or dest.is_symlink()
                or not dest.resolve().is_relative_to(root)):
            raise ValueError("Directorio temporal de sprites no confiable")
        return dest

    def _file(self, story_id: str, draft_id: str, expression: str, name: str) -> Path:
        if expression not in EXPRESSIONS or not isinstance(name, str):
            raise ValueError("Expresión de borrador inválida")
        match = re.fullmatch(re.escape(expression) + r"-([0-9a-f-]{36})\.png", name)
        if not match or str(uuid.UUID(match.group(1))) != match.group(1):
            raise ValueError("Nombre de archivo temporal inválido")
        path = self._folder(story_id, draft_id) / name
        if path.is_symlink() or not path.resolve().is_relative_to(
                self._folder(story_id, draft_id).resolve()):
            raise ValueError("Archivo temporal fuera del directorio de borradores")
        return path

    def _delete(self, row) -> None:
        folder = self._folder(row["story_id"], row["id"])
        with self.store._conn() as db:
            db.execute("DELETE FROM sprite_drafts WHERE story_id=? AND id=?",
                       (row["story_id"], row["id"]))
        if folder.exists():
            shutil.rmtree(folder)

    def prune_expired(self) -> int:
        cutoff = time.time() - DRAFT_TTL
        with self.store._conn() as db:
            rows = db.execute(
                "SELECT * FROM sprite_drafts WHERE updated_at<?",
                (cutoff,)).fetchall()
        removed = 0
        for row in rows:
            if row["id"] != self.active:
                self._delete(row)
                removed += 1
        return removed

    def _require(self, story_id: str, draft_id: str):
        self.media._require_story(story_id)
        with self.store._conn() as db:
            row = db.execute(
                "SELECT * FROM sprite_drafts WHERE id=? AND story_id=?",
                (draft_id, story_id)).fetchone()
        if row is None:
            raise ValueError("Borrador no encontrado en esta historia")
        return row

    def _summary(self, row) -> dict:
        settings = json.loads(row["settings_json"])
        saved = json.loads(row["slots_json"])
        slots = {}
        for name in EXPRESSIONS:
            entry = saved.get(name)
            present = False
            if isinstance(entry, dict):
                try:
                    present = self._file(
                        row["story_id"], row["id"], name, entry["file"]).is_file()
                except (KeyError, TypeError, ValueError):
                    present = False
            slots[name] = {"ready": present,
                           "quality": entry.get("quality") if present else None,
                           "preview_url": (
                               f"/api/v1/stories/{row['story_id']}/creator/"
                               f"sprite-drafts/{row['id']}/expressions/{name}/preview"
                               if present else None)}
        geometry = {
            name: saved[name]["geometry"]
            for name in EXPRESSIONS
            if slots[name]["ready"] and isinstance(saved.get(name), dict)
            and isinstance(saved[name].get("geometry"), dict)
        }
        warnings = alignment_warnings(geometry)
        return {
            "alignment_warnings": warnings,
            "alignment_review_needed": bool(warnings),
            "id": row["id"], "story_id": row["story_id"],
            "character_id": row["character_id"],
            "character_name": settings["character_name"],
            "caption": settings["caption"], "pose": settings["pose"],
            "seed": settings["seed"], "checkpoint": settings["comfy"]["checkpoint"],
            "style": settings["style"], "use_lora": bool(settings["lora"]),
            "reference_asset_id": settings["reference_asset_id"],
            "reference_sprite_asset_id": settings.get("reference_sprite_asset_id"),
            "reference_mode": settings.get("reference_mode", "img2img"),
            "ipadapter_preset": settings.get("ipadapter_preset", DEFAULT_PRESET),
            "ipadapter_weight": settings.get("ipadapter_weight", 0.7),
            "slots": slots, "ready_count": sum(s["ready"] for s in slots.values()),
            "created_at": row["created_at"], "updated_at": row["updated_at"],
        }

    def list(self, story_id: str) -> list[dict]:
        self.prune_expired()
        self.media._require_story(story_id)
        with self.store._conn() as db:
            rows = db.execute(
                "SELECT * FROM sprite_drafts WHERE story_id=? "
                "ORDER BY created_at DESC,id DESC", (story_id,)).fetchall()
        return [self._summary(row) for row in rows]

    def get(self, story_id: str, draft_id: str) -> dict:
        return self._summary(self._require(story_id, draft_id))

    def create(self, story_id: str, character_id: str, body: NewSpriteDraft) -> dict:
        self.prune_expired()
        self.media._require_story(story_id)
        pose = validate_pose(body.pose)
        caption = body.caption.strip()
        if len(caption) < 3:
            raise ValueError("Especifica el contexto del sprite")
        with self.store._conn() as db:
            count = db.execute(
                "SELECT COUNT(*) FROM sprite_drafts WHERE story_id=?",
                (story_id,)).fetchone()[0]
            if count >= MAX_DRAFTS_PER_STORY:
                raise ValueError("Máximo tres borradores por historia; descarta uno")
            character = db.execute(
                "SELECT config_json FROM creator_characters "
                "WHERE story_id=? AND id=?", (story_id, character_id)).fetchone()
        if character is None:
            raise ValueError("Personaje de otra historia o inexistente")
        npc = json.loads(character["config_json"])
        dna = npc.get("visual_dna") or {}
        appearance = ", ".join(dna.get("tags") or [])
        visual_id = npc.get("visual_character_id")
        if visual_id:
            visual = next((item for item in self.images.narrative.visual.characters(story_id)
                           if item["id"] == visual_id), None)
            if visual:
                appearance += " " + "; ".join(
                    part for part in (visual["appearance"], visual["outfit"],
                                      visual["distinguishing_features"]) if part)
        if not appearance.strip():
            appearance = npc.get("description", "")[:240]
        seed = (body.seed if body.seed is not None else
                dna.get("seed") if dna.get("seed") is not None else
                secrets.randbelow(2**53 - 1))
        reference_id = str(body.reference_asset_id) if body.reference_asset_id else None
        sprite_id = (str(body.reference_sprite_asset_id)
                     if body.reference_sprite_asset_id else None)
        if reference_id and sprite_id:
            raise ValueError("Selecciona solo una referencia por borrador")
        if body.reference_mode == "ipadapter" and not (reference_id or sprite_id):
            raise ValueError("IPAdapter requiere una imagen de referencia")
        reference_sha = None
        if reference_id:
            _, reference_sha = self.images.narrative.visual.reference_bytes(
                story_id, reference_id)
        if sprite_id:
            source = self.media.get(story_id, sprite_id)
            if (source["kind"] != "foreground" or
                    source["character_id"] != character_id):
                raise ValueError(
                    "Solo puede usarse un sprite publicado del mismo NPC")
            file = self.media._path(story_id, sprite_id, "foreground")
            if not file.is_file() or file.is_symlink():
                raise ValueError("El sprite de referencia no está disponible")
            data = file.read_bytes()
            if not 0 < len(data) <= MAX_MEDIA_BYTES:
                raise ValueError("El sprite de referencia supera el tamaño admitido")
            reference_sha = hashlib.sha256(data).hexdigest()
        lora = None
        if body.use_lora:
            filename = dna.get("lora_name")
            strength = dna.get("lora_strength", 0.8)
            if (not isinstance(filename, str) or not LORA_FILENAME.fullmatch(filename)
                    or not isinstance(strength, (float, int))
                    or isinstance(strength, bool) or not 0 < strength <= 2):
                raise ValueError("El NPC requiere LoRA válida y fuerza superior a cero")
            lora = {"character_name": npc["name"], "lora_name": filename,
                    "strength": float(strength)}
        config = self.images.config()
        if not config["checkpoint"]:
            raise ValueError("Selecciona un checkpoint en Ajustes de imágenes")
        saved = {
            "character_name": npc["name"], "appearance": appearance[:650],
            "caption": caption, "pose": pose, "style": body.style.strip()[:220],
            "seed": seed, "reference_asset_id": reference_id,
            "reference_sprite_asset_id": sprite_id,
            "reference_sha256": reference_sha,
            "reference_mode": body.reference_mode,
            "ipadapter_preset": body.ipadapter_preset,
            "ipadapter_weight": body.ipadapter_weight,
            "denoise": body.denoise,
            "lora": lora, "comfy": config,
        }
        ident = str(uuid.uuid4())
        with self.store._conn() as db:
            db.execute(
                "INSERT INTO sprite_drafts VALUES(?,?,?,?,?,?,?)",
                (ident, story_id, character_id,
                 json.dumps(saved, ensure_ascii=False), "{}",
                 time.time(), time.time()))
        return self.get(story_id, ident)

    @staticmethod
    def _prompt(settings: dict, expression: str) -> str:
        return (
            "Single character full-body sprite asset, one person only, centered, "
            "entire figure inside canvas with generous margins on all four sides. "
            "Completely flat uniform vivid chroma key green (#00FF00) background, "
            "solid green edge to edge, no room, no scenery, no shadow, no props "
            "behind figure. Clothing and hair MUST NOT be green. "
            "Character: " + settings["character_name"] + ". Identity and features: " +
            settings["appearance"] + ". Pose: " + settings["pose"] + ". "
            "Facial expression: " + EXPRESSION_GUIDES[expression] + ". "
            "Art direction: " + settings["style"] + ". "
            "High quality clean character outline, complete silhouette, consistent "
            "face and outfit, no text, no panel divisions, no sprite sheet.")

    async def generate(self, story_id: str, draft_id: str, expression: str,
                       body: SpriteStep) -> dict:
        row = self._require(story_id, draft_id)
        if expression not in EXPRESSIONS:
            raise ValueError("Expresión no admitida")
        if self.images.lock.locked():
            raise HTTPException(409, "ComfyUI está procesando otra imagen")
        await self.images.lock.acquire()
        self.active = draft_id
        lease = False
        try:
            settings = json.loads(row["settings_json"])
            comfy = settings["comfy"]
            if self.images.config() != comfy:
                raise HTTPException(409, "La configuración de ComfyUI cambió; inicia otro borrador")
            if self.images.resources is not None:
                await asyncio.to_thread(self.images.resources.allow_image_request,
                                        body.allow_low_vram)
                lease = await self.images.resources.claim_local_gpu("ComfyUI sprites")
            status = await self.images.status()
            if not status["online"]:
                raise HTTPException(503, "ComfyUI no está disponible")
            if comfy["checkpoint"] not in status["checkpoints"]:
                raise HTTPException(422, "El checkpoint del borrador ya no está instalado")
            loras = [settings["lora"]] if settings["lora"] else []
            if loras:
                inventory = await self.images.lora_status()
                if not inventory["online"]:
                    raise HTTPException(503, "No se pudo consultar LoRAs instalados")
                if loras[0]["lora_name"] not in inventory["loras"]:
                    raise HTTPException(422, "El LoRA del NPC no está instalado")
                await self.images.validate_lora_nodes()
            adapter_mode = settings.get("reference_mode") == "ipadapter"
            if adapter_mode:
                probe = await identity_adapter_status(
                    comfy["base_url"], self.images.transport)
                require_ipadapter_status(
                    probe, settings.get("ipadapter_preset", DEFAULT_PRESET))
            prompt = self._prompt(settings, expression)
            negative = (comfy["negative_prompt"] +
                        ", scenery, complex background, gradient backdrop, "
                        "multiple characters, duplicate faces, grid, montage, green clothing")
            workflow_config = {**comfy, "negative_prompt": negative}
            async with httpx.AsyncClient(transport=self.images.transport,
                    trust_env=False, timeout=httpx.Timeout(25, connect=5)) as client:
                reference_name = None
                reference = None
                if settings["reference_asset_id"]:
                    reference, digest = self.images.narrative.visual.reference_bytes(
                        story_id, settings["reference_asset_id"])
                elif settings.get("reference_sprite_asset_id"):
                    sprite_id = settings["reference_sprite_asset_id"]
                    source = self.media.get(story_id, sprite_id)
                    if (source["kind"] != "foreground" or
                            source["character_id"] != row["character_id"]):
                        raise HTTPException(422,
                            "El sprite de referencia ya no pertenece al NPC")
                    file = self.media._path(story_id, sprite_id, "foreground")
                    if not file.is_file() or file.is_symlink():
                        raise HTTPException(422, "La referencia de sprite desapareció")
                    reference = file.read_bytes()
                    if not 0 < len(reference) <= MAX_MEDIA_BYTES:
                        raise HTTPException(422, "Referencia de sprite inválida")
                    digest = hashlib.sha256(reference).hexdigest()
                if reference is not None:
                    if digest != settings["reference_sha256"]:
                        raise HTTPException(409, "La referencia visual del borrador cambió")
                    png = (identity_reference_png(
                        reference, comfy["width"], comfy["height"])
                        if adapter_mode or settings.get("reference_sprite_asset_id")
                        else resized_reference_png(
                            reference, comfy["width"], comfy["height"]))
                    uploaded = await client.post(
                        comfy["base_url"] + "/upload/image",
                        files={"image": ("NobleAI-Sprite-Reference.png", png, "image/png")},
                        data={"type": "input", "overwrite": "false"},
                        follow_redirects=False)
                    uploaded.raise_for_status()
                    reply = uploaded.json()
                    reference_name = reply.get("name") if isinstance(reply, dict) else None
                    if not isinstance(reference_name, str) or not re.fullmatch(
                            r"[A-Za-z0-9_.-]{1,180}", reference_name):
                        raise HTTPException(502, "Nombre de referencia ComfyUI inválido")
                nodes = workflow(
                    workflow_config, prompt, settings["seed"],
                    reference_name if not adapter_mode else None,
                    settings["denoise"], loras)
                if adapter_mode:
                    if reference_name is None:
                        raise HTTPException(422, "La referencia IPAdapter está ausente")
                    inject_ipadapter(
                        nodes, reference_name,
                        settings.get("ipadapter_preset", DEFAULT_PRESET),
                        settings.get("ipadapter_weight", 0.7))
                nodes["7"]["inputs"]["filename_prefix"] = "NobleAI-Expression"
                raw = await render_comfy(client, comfy["base_url"], nodes)
            try:
                png, quality = transparent_sprite(raw)
            except ValueError as exc:
                raise HTTPException(422, "Recorte no aceptado: " + str(exc)) from exc
            geometry = geometry_from_png(png)
            file_sha256 = hashlib.sha256(png).hexdigest()
            new_name = expression + "-" + str(uuid.uuid4()) + ".png"
            target = self._file(story_id, draft_id, expression, new_name)
            target.parent.mkdir(parents=True, exist_ok=True)
            old = json.loads(row["slots_json"]).get(expression)
            try:
                with target.open("xb") as output:
                    output.write(png)
                with self.store._conn() as db:
                    current = db.execute(
                        "SELECT slots_json FROM sprite_drafts "
                        "WHERE story_id=? AND id=?", (story_id, draft_id)).fetchone()
                    if not current:
                        raise ValueError("Borrador eliminado durante la generación")
                    slots = json.loads(current["slots_json"])
                    slots[expression] = {
                        "file": new_name, "quality": quality,
                        "geometry": geometry, "content_sha256": file_sha256,
                        "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
                    }
                    db.execute(
                        "UPDATE sprite_drafts SET slots_json=?,updated_at=? "
                        "WHERE story_id=? AND id=?",
                        (json.dumps(slots), time.time(), story_id, draft_id))
            except Exception:
                target.unlink(missing_ok=True)
                raise
            if old:
                try:
                    self._file(story_id, draft_id, expression, old["file"]).unlink(
                        missing_ok=True)
                except (ValueError, TypeError, KeyError):
                    pass
            return self.get(story_id, draft_id)
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Error comunicando con ComfyUI: " +
                                str(exc)[:160]) from exc
        finally:
            self.active = None
            if self.images.resources is not None:
                self.images.resources.release_local_gpu(lease)
            self.images.lock.release()

    def preview(self, story_id: str, draft_id: str, expression: str):
        row = self._require(story_id, draft_id)
        entries = json.loads(row["slots_json"])
        if expression not in EXPRESSIONS or expression not in entries:
            raise ValueError("Expresión aún no generada")
        file = self._file(story_id, draft_id, expression,
                          entries[expression]["file"])
        if not file.is_file():
            raise ValueError("Falta un sprite de vista previa")
        return FileResponse(file, media_type="image/png",
                            headers={"Cache-Control": "no-store",
                                     "X-Content-Type-Options": "nosniff"})

    def approve(self, story_id: str, draft_id: str,
                accept_alignment_warnings: bool = False) -> dict:
        row = self._require(story_id, draft_id)
        if self.active == draft_id:
            raise HTTPException(409, "El borrador está generando una expresión")
        with self.store._conn() as db:
            if not db.execute(
                "SELECT 1 FROM creator_characters WHERE story_id=? AND id=?",
                (story_id, row["character_id"])).fetchone():
                raise ValueError("El NPC ya no existe en esta historia")
        entries = json.loads(row["slots_json"])
        if any(name not in entries for name in EXPRESSIONS):
            raise ValueError("Genera las cinco expresiones antes de aprobar")
        frames = []
        geometry = {}
        dims = None
        for name in EXPRESSIONS:
            location = self._file(
                story_id, draft_id, name, entries[name]["file"])
            if not location.is_file() or location.stat().st_size > MAX_MEDIA_BYTES:
                raise ValueError("Falta una vista previa válida")
            raw = location.read_bytes()
            expected_sha = entries[name].get("content_sha256")
            if (expected_sha is not None and
                    hashlib.sha256(raw).hexdigest() != expected_sha):
                raise HTTPException(409,
                    "Una vista previa cambió después de generarse: " + name)
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
                if image.format != "PNG" or image.mode != "RGBA":
                    raise ValueError("Vista previa de sprite inválida")
                if dims is not None and dims != image.size:
                    raise ValueError("Las cinco expresiones tienen tamaños diferentes")
                dims = image.size
                frames.append(image.copy())
                geometry[name] = silhouette_geometry(image)
        warnings = alignment_warnings(geometry)
        if warnings and not accept_alignment_warnings:
            raise HTTPException(409,
                "Revisa las diferencias de silueta antes de aprobar: " +
                "; ".join(warnings[:5]))
        sheet = Image.new("RGBA", (dims[0] * 5, dims[1]))
        for index, image in enumerate(frames):
            sheet.paste(image, (index * dims[0], 0))
        output = io.BytesIO()
        sheet.save(output, "PNG", optimize=True)
        settings = json.loads(row["settings_json"])
        generation = {
            name: normalize_sprite_generation({
                "workflow_version": ("comfy-sprite-v2-ipadapter"
                                     if settings.get("reference_mode") == "ipadapter"
                                     else "comfy-sprite-v1"),
                "checkpoint": settings["comfy"]["checkpoint"],
                "seed": settings["seed"],
                "prompt_sha256": entries[name]["prompt_sha256"],
                "lora": settings["lora"],
                "quality": {**entries[name]["quality"], "author_approved": True},
                **({"adapter": {
                    "preset": settings.get("ipadapter_preset", DEFAULT_PRESET),
                    "weight": settings.get("ipadapter_weight", 0.7),
                    "reference_sha256": settings["reference_sha256"],
                    "reference_kind": (
                        "sprite" if settings.get("reference_sprite_asset_id")
                        else "gallery"),
                }} if settings.get("reference_mode") == "ipadapter" else {}),
            }) for name in EXPRESSIONS
        }
        assets = self.media.import_expression_sheet(
            story_id, row["character_id"], output.getvalue(),
            settings["caption"], settings["pose"], layout="horizontal",
            generation=generation)
        self._delete(row)
        return {"count": len(assets), "assets": assets, "approved": True}

    def discard(self, story_id: str, draft_id: str) -> None:
        row = self._require(story_id, draft_id)
        if self.active == draft_id:
            raise HTTPException(409, "No se puede descartar durante una generación")
        self._delete(row)


def mount_sprite_draft_routes(app, sprites: SpriteDraftService) -> None:
    @app.get("/api/v1/images/identity-adapter/status")
    async def get_identity_adapter_status():
        config = sprites.images.config()
        return await identity_adapter_status(config["base_url"],
                                             sprites.images.transport)

    @app.get("/api/v1/stories/{story_id}/creator/sprite-drafts")
    def list_drafts(story_id: uuid.UUID):
        return {"drafts": sprites.list(str(story_id))}

    @app.post("/api/v1/stories/{story_id}/creator/characters/{character_id}/sprite-drafts",
              status_code=201)
    def create_draft(story_id: uuid.UUID, character_id: uuid.UUID, body: NewSpriteDraft):
        try:
            return sprites.create(str(story_id), str(character_id), body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/creator/sprite-drafts/{draft_id}")
    def get_draft(story_id: uuid.UUID, draft_id: uuid.UUID):
        try:
            return sprites.get(str(story_id), str(draft_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/sprite-drafts/{draft_id}/expressions/{expression}")
    async def generate_draft_step(story_id: uuid.UUID, draft_id: uuid.UUID,
                                  expression: DraftExpression, body: SpriteStep):
        try:
            return await sprites.generate(
                str(story_id), str(draft_id), expression, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/creator/sprite-drafts/{draft_id}/expressions/{expression}/preview")
    def preview_draft(story_id: uuid.UUID, draft_id: uuid.UUID,
                      expression: DraftExpression):
        try:
            return sprites.preview(str(story_id), str(draft_id), expression)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/sprite-drafts/{draft_id}/approve")
    def approve_draft(story_id: uuid.UUID, draft_id: uuid.UUID,
                      body: ApproveSpriteDraft = ApproveSpriteDraft()):
        try:
            return sprites.approve(
                str(story_id), str(draft_id), body.accept_alignment_warnings)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.delete("/api/v1/stories/{story_id}/creator/sprite-drafts/{draft_id}",
                status_code=204)
    def discard_draft(story_id: uuid.UUID, draft_id: uuid.UUID):
        try:
            sprites.discard(str(story_id), str(draft_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
