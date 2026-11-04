"""Remote Noble worker connections through authenticated Cloudflare Quick Tunnels.

P1.2 supports only an explicitly registered HTTPS trycloudflare.com worker
speaking OpenAI-compatible /v1/models and /v1/chat/completions. It does NOT
implement Urakatsu's internal worker protocol or start Colab notebooks.
Tokens live in OS keyring, never SQLite or HTTP read responses.
"""
from __future__ import annotations

import sqlite3
import time
import uuid
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

from .store import Store

KEYRING_SERVICE = "noble-ai-workers"


def validate_tunnel(url: str) -> str:
    try:
        parsed = urlsplit(url.strip())
        if (parsed.scheme != "https" or not parsed.hostname
                or not parsed.hostname.endswith(".trycloudflare.com")
                or parsed.hostname == ".trycloudflare.com"
                or parsed.username or parsed.password or parsed.port is not None
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ValueError("Enlace de worker inválido")
    except (ValueError, AttributeError) as exc:
        raise ValueError("Utiliza https://<nombre>.trycloudflare.com sin rutas ni parámetros") from exc
    return "https://" + parsed.hostname.lower()


class WorkerInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    url: str = Field(min_length=20, max_length=256)
    token: str = Field(min_length=12, max_length=512)


class WorkerModel(BaseModel):
    model: str = Field(min_length=1, max_length=180)


class KeyringVault:
    def get(self, worker_id: str) -> str:
        try:
            import keyring
            return keyring.get_password(KEYRING_SERVICE, worker_id) or ""
        except Exception:
            return ""

    def set(self, worker_id: str, token: str) -> None:
        try:
            import keyring
            keyring.set_password(KEYRING_SERVICE, worker_id, token)
        except Exception as exc:
            raise ValueError("No hay almacén de credenciales del sistema para el token de worker") from exc

    def delete(self, worker_id: str) -> None:
        try:
            import keyring
            keyring.delete_password(KEYRING_SERVICE, worker_id)
        except Exception:
            pass


class WorkerRegistry:
    def __init__(self, store: Store, transport: httpx.AsyncBaseTransport | None = None,
                 vault=None):
        self.store = store
        self.transport = transport
        self.vault = vault or KeyringVault()
        with store._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS worker_connections (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
                role TEXT NOT NULL, created_at REAL NOT NULL)""")

    def info(self, worker_id: str) -> dict | None:
        with self.store._conn() as db:
            row = db.execute("SELECT * FROM worker_connections WHERE id=?",
                             (worker_id,)).fetchone()
            return dict(row) if row else None

    def list(self) -> list[dict]:
        with self.store._conn() as db:
            return [dict(row) for row in db.execute(
                "SELECT * FROM worker_connections ORDER BY created_at DESC LIMIT 100")]

    def add(self, entry: WorkerInput) -> dict:
        url = validate_tunnel(entry.url)
        identity = str(uuid.uuid4())
        self.vault.set(identity, entry.token.strip())
        try:
            with self.store._conn() as db:
                db.execute("INSERT INTO worker_connections VALUES (?,?,?,?,?)",
                           (identity, entry.name.strip(), url, "llm", time.time()))
        except sqlite3.Error:
            self.vault.delete(identity)
            raise
        return self.info(identity)

    def remove(self, identity: str) -> None:
        if not self.info(identity):
            raise ValueError("Worker no registrado")
        with self.store._conn() as db:
            db.execute("DELETE FROM worker_connections WHERE id=?", (identity,))
        self.vault.delete(identity)

    def endpoint(self, worker_id: str) -> tuple[str, str]:
        data = self.info(worker_id)
        if data is None:
            raise ValueError("Worker inexistente. Regístralo antes de usarlo.")
        url = validate_tunnel(data["url"])
        token = self.vault.get(worker_id)
        if not token:
            raise ValueError("Falta el token del worker en el almacén de credenciales")
        return url, token

    async def probe(self, worker_id: str) -> dict:
        record = self.info(worker_id)
        if not record:
            raise ValueError("Worker inexistente")
        started = time.perf_counter()
        try:
            endpoint, token = self.endpoint(worker_id)
            health = None
            async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                                         timeout=12) as client:
                response = await client.get(
                    endpoint + "/v1/models",
                    headers={"Authorization": "Bearer " + token}, follow_redirects=False)
                response.raise_for_status()
                # A tunnel to a naked inference server might ignore Bearer tokens.
                # Reject it: any person with the URL could otherwise use the GPU.
                invalid_token = "noble-invalid-" + uuid.uuid4().hex
                forbidden = await client.get(
                    endpoint + "/v1/models",
                    headers={"Authorization": "Bearer " + invalid_token},
                    follow_redirects=False)
                if forbidden.status_code not in (401, 403):
                    raise ValueError("El worker no valida credenciales Bearer; configura un proxy autenticado")
                data = response.json()
                models = [row.get("id") for row in data.get("data", [])
                          if isinstance(row, dict) and isinstance(row.get("id"), str)]
                # The telemetry endpoint is optional for older worker versions.
                try:
                    measured = await client.get(
                        endpoint + "/v1/health",
                        headers={"Authorization": "Bearer " + token},
                        follow_redirects=False, timeout=5)
                    if measured.status_code == 200:
                        raw = measured.json()
                        if isinstance(raw, dict) and raw.get("protocol") == "noble-worker-v1":
                            gpus = raw.get("gpu", [])
                            health = {
                                "engine_status": raw.get("engine_status"),
                                "active_requests": raw.get("active_requests"),
                                "completed_requests": raw.get("completed_requests"),
                                "failed_requests": raw.get("failed_requests"),
                                "last_ttft_ms": raw.get("last_ttft_ms"),
                                "avg_ttft_ms": raw.get("avg_ttft_ms"),
                                "avg_duration_ms": raw.get("avg_duration_ms"),
                                "gpu": gpus[:8] if isinstance(gpus, list) else [],
                            }
                except (httpx.HTTPError, ValueError, TypeError):
                    pass
            return {"id": worker_id, "online": True, "models": models[:100],
                    "role": "llm", "latency_ms": round(
                        (time.perf_counter() - started) * 1000, 1), "health": health}
        except (ValueError, httpx.HTTPError, KeyError) as exc:
            return {"id": worker_id, "online": False, "models": [],
                    "role": "llm", "error": str(exc)[:220]}


def mount_worker_routes(app, registry: WorkerRegistry, narrative):
    @app.get("/api/v1/workers")
    def workers():
        return {"workers": registry.list(), "supported_role": "llm",
                "supported_tunnel": "https://*.trycloudflare.com"}

    @app.post("/api/v1/workers", status_code=201)
    def register(body: WorkerInput):
        try:
            return registry.add(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/workers/{worker_id}/probe")
    async def probe(worker_id: uuid.UUID):
        try:
            return await registry.probe(str(worker_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.delete("/api/v1/workers/{worker_id}", status_code=204)
    def remove(worker_id: uuid.UUID):
        try:
            registry.remove(str(worker_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/workers/{worker_id}/activate")
    async def activate(worker_id: uuid.UUID, body: WorkerModel):
        info = await registry.probe(str(worker_id))
        if not info["online"] or body.model not in info["models"]:
            raise HTTPException(422, "El modelo elegido no está anunciado por el worker")
        from .narrative import LlmSettings
        current = narrative.config()
        current.update({
            "provider": "worker", "worker_id": str(worker_id),
            "base_url": registry.info(str(worker_id))["url"],
            "model": body.model, "device": "auto",
        })
        try:
            return narrative.configure(LlmSettings.model_validate(current))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
