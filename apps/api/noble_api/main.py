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
from .downloads import DownloadManager
from .hardware import snapshot
from .store import Store

ROOT = Path(__file__).resolve().parents[4]


class InstallBody(BaseModel):
    repo_id: str = Field(min_length=3, max_length=195)
    revision: str
    filename: str


class AssignBody(BaseModel):
    installed_id: str


class SetupBody(BaseModel):
    setup_complete: bool | None = None
    language: str | None = None
    image_mode: str | None = None
    tts_enabled: bool | None = None
    tts_autoread: bool | None = None


def create_app(
    data_dir: Path | None = None,
    catalog_transport: httpx.BaseTransport | None = None,
) -> FastAPI:
    """Injectable data directory and HF transport make contract tests offline."""
    directory = Path(data_dir or os.getenv("NOBLE_DATA_DIR") or ROOT / "data")
    store = Store(directory)
    catalog = HfCatalog(transport=catalog_transport)
    downloads = DownloadManager(store, catalog)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        downloads.shutdown()
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

    @service.exception_handler(CatalogError)
    async def catalog_exception(_request, exc: CatalogError):
        return JSONResponse(status_code=exc.status_code,
                            content={"detail": str(exc)})

    @service.get("/api/v1/health")
    def health():
        return {"status": "ok", "version": "0.1.0",
                "model_hub": "available", "llm_runtime": "not_implemented",
                "image_runtime": "not_implemented", "tts_runtime": "not_implemented"}

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
                {"id": "koboldcpp", "kind": "llm", "status": "pending_integration"},
                {"id": "comfyui", "kind": "image", "status": "pending_integration"},
                {"id": "chatterbox", "kind": "tts", "status": "pending_integration"},
            ]
        }

    @service.get("/api/v1/models/search")
    def search(q: str = Query(min_length=2, max_length=100),
               role: str = "narrator", limit: int = Query(20, ge=1, le=30)):
        return catalog.search(q, role, limit)

    @service.get("/api/v1/models/installed")
    def installed():
        return {"models": store.installed()}

    @service.post("/api/v1/models/install", status_code=202)
    def install(body: InstallBody):
        return downloads.install(body.repo_id, body.revision, body.filename)

    @service.get("/api/v1/downloads")
    def download_list():
        return {"downloads": store.downloads()}

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

    # Keep the catch-all model detail route last to avoid masking /installed.
    @service.get("/api/v1/models/{repo_id:path}")
    def model_details(repo_id: str):
        return catalog.details(repo_id)

    # A Vite-built frontend can be served from the same FastAPI origin.
    ui_dist = ROOT / "apps" / "web" / "dist"
    if ui_dist.is_dir():
        from fastapi.staticfiles import StaticFiles
        service.mount("/", StaticFiles(directory=str(ui_dist), html=True),
                      name="noble-ui")
    return service


app = create_app()
