"""FastAPI control plane. Run: uvicorn noble_api.main:app --app-dir apps/api --reload.

No checkpoints or GPU models are loaded on application start.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .catalog import CatalogError, HfCatalog, ROLES
from .model_fit import assess_variants
from .model_storage import inspect_model_storage
from .downloads import DownloadManager
from .hardware import snapshot
from .store import Store
from .narrative import LlmSettings, NarrativeService, mount_narrative_routes
from .runtime import KoboldManager, RuntimeFailure
from .control import ControlPlane, mount_control_routes
from .secrets import Secrets
from .media import mount_media_routes
from .images import SceneImageService, mount_image_routes
from .speech import SpeechService, mount_speech_routes
from .visual_state import VisualState, mount_visual_routes
from .scene_planner import ScenePlanner, mount_scene_plan_routes
from .creator import CreatorService, mount_creator_routes
from .lorebook import LorebookService, mount_lorebook_routes
from .world_state import WorldStateService, mount_world_state_routes
from .creator_media import CreatorMediaService, mount_creator_media_routes
from .story_export import mount_story_export_routes
from .episodic_memory import EpisodicMemory, mount_episodic_routes
from .context_inspector import mount_context_inspector_routes
from .resource_policy import ResourceController, mount_resource_routes
from .workers import WorkerRegistry, mount_worker_routes

ROOT = Path(__file__).resolve().parents[3]


class KeyInput(BaseModel):
    api_key: str = Field(min_length=12, max_length=4096)


class InstallBody(BaseModel):
    repo_id: str = Field(min_length=3, max_length=195)
    revision: str
    filename: str


class AssignBody(BaseModel):
    installed_id: str


class LaunchKobold(BaseModel):
    executable: str = Field(min_length=4, max_length=4096)
    installed_id: str
    gpu_layers: int = Field(default=-1, ge=-1, le=256)
    contextsize: int = Field(default=4096, ge=512, le=32768)
    port: int = Field(default=5001, ge=1024, le=65535)


class SetupBody(BaseModel):
    setup_complete: bool | None = None
    language: str | None = None
    image_mode: str | None = None
    tts_enabled: bool | None = None
    tts_autoread: bool | None = None


def create_app(
    data_dir: Path | None = None,
    catalog_transport: httpx.BaseTransport | None = None,
    llm_transport: httpx.AsyncBaseTransport | None = None,
    control_transport: httpx.BaseTransport | None = None,
    worker_transport: httpx.AsyncBaseTransport | None = None,
    worker_vault=None,
    image_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """Injectable data directory and HF transport make contract tests offline."""
    directory = Path(data_dir or os.getenv("NOBLE_DATA_DIR") or ROOT / "data")
    store = Store(directory)
    catalog = HfCatalog(transport=catalog_transport)
    downloads = DownloadManager(store, catalog)
    control = ControlPlane(store, transport=control_transport)
    secrets = Secrets()
    workers = WorkerRegistry(store, transport=worker_transport, vault=worker_vault)
    narrative = NarrativeService(store, transport=llm_transport, secrets=secrets,
                                 preferences=control.preferences, workers=workers)
    # Reconcile only UUID-scoped, Noble-marked fork directories from a
    # previously interrupted process. Never touch unrelated user media.
    narrative.fork_recovery_report = narrative.recover_incomplete_forks()
    kobold = KoboldManager(store)
    visual = VisualState(store)
    planner = ScenePlanner(visual)
    visual.planner = planner
    narrative.visual = visual
    resources = ResourceController(store)
    narrative.resources = resources
    creator = CreatorService(narrative)
    narrative.creator = creator
    lorebook = LorebookService(narrative)
    narrative.lorebook = lorebook
    world = WorldStateService(narrative)
    narrative.world = world
    creator_media = CreatorMediaService(narrative)
    narrative.creator_media = creator_media
    episodes = EpisodicMemory(narrative)
    narrative.episodes = episodes
    images = SceneImageService(narrative, transport=image_transport, resources=resources)
    speech = SpeechService(narrative)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        downloads.shutdown()
        kobold.stop()
        catalog.close()

    service = FastAPI(title="Noble AI Model Hub", version="0.1.0",
                      lifespan=lifespan)
    service.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                       "http://localhost:4173", "http://127.0.0.1:4173"],
        allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )
    service.state.store = store
    service.state.downloads = downloads
    service.state.catalog = catalog
    service.state.control = control
    service.state.workers = workers
    service.state.narrative = narrative
    service.state.kobold = kobold
    service.state.images = images
    service.state.resources = resources
    service.state.speech = speech
    service.state.visual = visual
    service.state.scene_planner = planner
    service.state.creator = creator
    service.state.lorebook = lorebook
    service.state.world = world
    service.state.creator_media = creator_media
    service.state.episodes = episodes

    @service.exception_handler(CatalogError)
    async def catalog_exception(_request, exc: CatalogError):
        return JSONResponse(status_code=exc.status_code,
                            content={"detail": str(exc)})

    @service.get("/api/v1/health")
    def health():
        return {"status": "ok", "version": "0.1.0",
                "model_hub": "available", "llm_runtime": "external_provider_adapter",
                "image_runtime": "comfyui_on_demand", "tts_runtime": "piper_on_demand"}

    @service.get("/api/v1/hardware")
    def hardware():
        return snapshot(str(store.models_dir))

    @service.get("/api/v1/settings")
    def settings():
        return {**store.settings(), "models_dir": str(store.models_dir)}

    @service.patch("/api/v1/settings")
    def update_settings(body: SetupBody):
        try:
            changes = body.model_dump(exclude_unset=True)
            if any(v is None for v in changes.values()):
                raise ValueError("No se puede guardar una configuración nula")
            return {**store.patch_settings(changes), "models_dir": str(store.models_dir)}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @service.get("/api/v1/providers")
    def providers():
        return {
            "available": [
                {"id": "huggingface", "kind": "catalog", "status": "ready"},
                {"id": "koboldcpp", "kind": "llm", "status": "connectable_external"},
                {"id": "ollama", "kind": "llm", "status": "connectable_external"},
                {"id": "openrouter", "kind": "llm", "status": "configured" if secrets.read() else "needs_key"},
                {"id": "comfyui", "kind": "image", "status": "connectable_external"},
                {"id": "piper", "kind": "tts", "status": "available" if speech.voices()["available"] else "needs_install"},
            ]
        }

    @service.get("/api/v1/models/search")
    def search(q: str = Query(min_length=2, max_length=100),
               role: str = "narrator", limit: int = Query(20, ge=1, le=30),
               sort: str = "downloads"):
        return catalog.search(q, role, limit, sort)

    @service.get("/api/v1/models/storage")
    def models_storage():
        return inspect_model_storage(store)

    @service.get("/api/v1/models/installed")
    def installed():
        return {"models": store.installed()}

    @service.post("/api/v1/models/install", status_code=202)
    def install(body: InstallBody):
        return downloads.install(body.repo_id, body.revision, body.filename)

    @service.get("/api/v1/downloads")
    def download_list():
        return {"downloads": store.downloads()}

    @service.get("/api/v1/downloads/recovery")
    def download_recovery():
        """Read-only summary of startup file/SQLite reconciliation."""
        return downloads.recovery_report

    @service.get("/api/v1/downloads/{job_id}")
    def download_one(job_id: str):
        job = store.download(job_id)
        if job is None:
            raise HTTPException(404, "Descarga inexistente")
        return job

    @service.post("/api/v1/downloads/{job_id}/pause")
    def pause(job_id: str):
        return downloads.control(job_id, "pause")

    @service.post("/api/v1/downloads/{job_id}/resume")
    def resume(job_id: str):
        return downloads.control(job_id, "resume")

    @service.post("/api/v1/downloads/{job_id}/cancel")
    def cancel(job_id: str):
        return downloads.control(job_id, "cancel")

    @service.get("/api/v1/model-roles")
    def model_roles():
        return {"roles": store.roles(), "runtime_connected": False}

    @service.put("/api/v1/model-roles/{role}")
    def assign(role: str, body: AssignBody):
        try:
            return {"roles": store.assign(role, body.installed_id),
                    "runtime_connected": False,
                    "message": "Modelo asignado. La inferencia se integrará en P1."}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @service.get("/api/v1/model-cards/{namespace}/{model}")
    def model_card(namespace: str, model: str, revision: str):
        return catalog.model_card(namespace + "/" + model, revision)

    # Keep the catch-all model detail route last to avoid masking /installed.
    @service.get("/api/v1/models/{repo_id:path}")
    def model_details(repo_id: str, context_tokens: int = Query(4096, ge=512, le=32768)):
        detail = catalog.details(repo_id)
        hw = snapshot(str(store.models_dir))
        header = {}
        revision = detail.get("revision") or ""
        supported = [v for v in detail.get("variants",[]) if
                     v.get("supported") and v.get("size_bytes")]
        if len(revision) == 40 and supported:
            # Get the header from one variant only: GGUF architecture and
            # context fields are shared by quantizations of the same base.
            candidate = min(supported,key=lambda v:v["size_bytes"])
            header = catalog.header(repo_id,revision,candidate["filename"])
        detail["hardware_fit"] = assess_variants(detail,hw,context_tokens,header)
        return detail

    mount_narrative_routes(service, narrative)
    mount_story_export_routes(service, narrative)
    mount_episodic_routes(service, episodes)
    mount_context_inspector_routes(service, narrative)
    mount_media_routes(service, narrative)
    mount_visual_routes(service, visual)
    mount_scene_plan_routes(service, planner)
    mount_creator_routes(service, creator)
    mount_lorebook_routes(service, lorebook)
    mount_world_state_routes(service, world)
    mount_creator_media_routes(service, creator_media)
    mount_image_routes(service, images)
    mount_resource_routes(service, resources)
    mount_speech_routes(service, speech)
    mount_worker_routes(service, workers, narrative)
    mount_control_routes(service, control)

    @service.get("/api/v1/provider-credentials/openrouter")
    def key_status():
        return secrets.status()

    @service.put("/api/v1/provider-credentials/openrouter")
    def set_key(body: KeyInput):
        try:
            return secrets.set(body.api_key)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @service.delete("/api/v1/provider-credentials/openrouter")
    def delete_key():
        try:
            return secrets.delete()
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @service.get("/api/v1/runtime/kobold/status")
    def kobold_status():
        return kobold.status()

    @service.get("/api/v1/runtime/kobold/installed")
    def kobold_candidates():
        return {"models": kobold.installed_models()}

    @service.post("/api/v1/runtime/kobold/start", status_code=202)
    def kobold_start(body: LaunchKobold):
        try:
            return kobold.start(body.executable, body.installed_id,
                                body.gpu_layers, body.contextsize, body.port)
        except RuntimeFailure as exc:
            raise HTTPException(422, str(exc)) from exc

    @service.post("/api/v1/runtime/kobold/stop")
    def kobold_stop():
        return kobold.stop()

    @service.post("/api/v1/runtime/kobold/activate")
    def kobold_activate():
        try:
            selected = kobold.activate_model()
            config = narrative.config()
            config.update(selected)
            return narrative.configure(LlmSettings.model_validate(config))
        except (ValueError, RuntimeFailure) as exc:
            raise HTTPException(422, str(exc)) from exc

    # A Vite-built frontend can be served from the same FastAPI origin.
    ui_dist = ROOT / "apps" / "web" / "dist"
    if ui_dist.is_dir():
        from fastapi.staticfiles import StaticFiles
        service.mount("/", StaticFiles(directory=str(ui_dist), html=True),
                      name="noble-ui")
    return service


app = create_app()
