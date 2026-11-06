"""Explicit, resumable Piper voice-pair installer from pinned Hugging Face revisions.

Only curated paths from rhasspy/piper-voices are accepted. The ONNX and JSON
sidecar are downloaded as a unit, verified, then published into Noble's voice
directory with the ONNX rename last so readers never see a half-installed pair.
No external script is executed and Piper is never started by this installer.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .catalog import CatalogError, HfCatalog, HEX_SHA256, REVISION
from .speech import SpeechService

REPO = "rhasspy/piper-voices"
VOICES = {
    "es_MX-ald-medium.onnx": {
        "name": "Ald · Español mexicano", "language": "es_MX",
        "quality": "medium", "path": "es/es_MX/ald/medium",
    },
    "es_MX-claude-high.onnx": {
        "name": "Claude · Español mexicano", "language": "es_MX",
        "quality": "high", "path": "es/es_MX/claude/high",
    },
}
MAX_MODEL = 300 * 1024 * 1024
MAX_CONFIG = 64 * 1024


class VoiceInstallInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_id: str = Field(min_length=4, max_length=180)


class VoiceInstaller:
    def __init__(self, speech: SpeechService, catalog: HfCatalog):
        self.speech = speech
        self.catalog = catalog
        self.root = speech.root.resolve()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="noble-piper-install")
        self.lock = threading.Lock()
        with speech.narrative.store._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS tts_downloads(
                id TEXT PRIMARY KEY, voice_id TEXT NOT NULL, revision TEXT NOT NULL,
                sources TEXT NOT NULL, status TEXT NOT NULL,
                received_bytes INTEGER NOT NULL, total_bytes INTEGER NOT NULL,
                error TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
            )""")
            db.execute("""UPDATE tts_downloads SET status='paused',
                error='Descarga interrumpida; reanuda para verificar'
                WHERE status IN ('queued','downloading','verifying')""")

    def _db(self):
        return self.speech.narrative.store._conn()

    def _row(self, job_id: str) -> dict | None:
        with self._db() as db:
            row = db.execute("SELECT * FROM tts_downloads WHERE id=?", (job_id,)).fetchone()
        if not row:
            return None
        return {**dict(row), "sources": json.loads(row["sources"])}

    def _transition(self, job_id: str, allowed: tuple[str, ...],
                    status: str, error: str | None = None) -> bool:
        marks = ",".join("?" for _ in allowed)
        with self._db() as db:
            result = db.execute(
                f"UPDATE tts_downloads SET status=?, error=?, updated_at=? "
                f"WHERE id=? AND status IN ({marks})",
                (status, error, time.time(), job_id, *allowed))
            return result.rowcount == 1

    def _bytes(self, job_id: str, count: int):
        with self._db() as db:
            db.execute("UPDATE tts_downloads SET received_bytes=?, updated_at=? "
                       "WHERE id=? AND status='downloading'",
                       (count, time.time(), job_id))

    def catalog_listing(self) -> dict:
        installed = {item["id"] for item in self.speech.voices()["voices"]}
        return {
            "source": REPO, "language_focus": "es_MX", "runtime": "piper",
            "voices": [{ "id": key, **data, "installed": key in installed,
                         "model_card": "https://huggingface.co/" + REPO +
                                       "/tree/main/" + data["path"]}
                       for key, data in VOICES.items()],
            "engine_installed": self.speech.voices()["available"],
            "note": "Cada voz tiene licencia/model card propia. La instalación no instala el ejecutable Piper.",
        }

    def list_jobs(self) -> dict:
        with self._db() as db:
            rows = db.execute("SELECT id FROM tts_downloads ORDER BY created_at DESC LIMIT 30").fetchall()
        return {"downloads": [self._row(row["id"]) for row in rows]}

    def get(self, job_id: str) -> dict:
        row = self._row(job_id)
        if row is None:
            raise HTTPException(404, "No existe esa instalación de voz")
        return row

    def _metadata(self, voice_id: str) -> tuple[str, list[dict]]:
        selected = VOICES[voice_id]
        info = self.catalog._get("/api/models/" + REPO)
        if not isinstance(info, dict) or not REVISION.fullmatch(str(info.get("sha", ""))):
            raise CatalogError(502, "Hugging Face no devolvió una revisión inmutable válida")
        if info.get("gated"):
            raise CatalogError(403, "La voz requiere permisos de acceso")
        revision = info["sha"]
        files = self.catalog._get("/api/models/" + REPO + "/tree/" +
                                  revision + "/" + selected["path"],
                                  {"expand": "true"})
        if not isinstance(files, list):
            raise CatalogError(502, "Listado de archivos Piper inválido")
        by_path = {item.get("path"): item for item in files if isinstance(item, dict)}
        result = []
        for suffix, maximum, minimum in (("", MAX_MODEL, 1024 * 1024),
                                          (".json", MAX_CONFIG, 50)):
            filename = voice_id + suffix
            upstream = selected["path"] + "/" + filename
            item = by_path.get(upstream)
            if item is None:
                raise CatalogError(404, "Falta un archivo de la pareja ONNX/JSON en el catálogo")
            size = item.get("size")
            if type(size) is not int or not minimum <= size <= maximum:
                raise CatalogError(422, "Tamaño del archivo Piper desconocido o no permitido")
            lfs = item.get("lfs") or {}
            digest = lfs.get("oid") or item.get("sha256")
            if isinstance(digest, str):
                digest = digest.removeprefix("sha256:")
            else:
                digest = None
            if digest is not None and not HEX_SHA256.fullmatch(digest):
                raise CatalogError(502, "SHA-256 anunciado por el repositorio es inválido")
            result.append({"filename": filename, "upstream": upstream,
                           "size": size, "sha256": digest})
        return revision, result

    def start(self, voice_id: str) -> dict:
        if voice_id not in VOICES:
            raise HTTPException(422, "Voz no disponible en el catálogo de Noble")
        if voice_id in {x["id"] for x in self.speech.voices()["voices"]}:
            raise HTTPException(409, "La voz ya está instalada")
        # Resolve a pinned commit and both files before queuing any bytes.
        revision, sources = self._metadata(voice_id)
        with self.lock:
            with self._db() as db:
                active = db.execute(
                    "SELECT id FROM tts_downloads WHERE voice_id=? AND "
                    "status IN ('queued','downloading','verifying','paused') "
                    "ORDER BY created_at DESC LIMIT 1", (voice_id,)).fetchone()
                if active:
                    raise HTTPException(409, "La voz tiene una instalación activa o pausada")
                job_id = str(uuid.uuid4())
                now = time.time()
                db.execute("INSERT INTO tts_downloads VALUES (?,?,?,?,?,?,?,?,?,?)",
                           (job_id, voice_id, revision, json.dumps(sources),
                            "queued", 0, sum(i["size"] for i in sources),
                            None, now, now))
            self.pool.submit(self._run, job_id)
        return self.get(job_id)

    def control(self, job_id: str, action: str) -> dict:
        job = self.get(job_id)
        if action == "pause":
            allowed, target = ("queued", "downloading", "verifying"), "paused"
        elif action == "resume":
            allowed, target = ("paused", "failed"), "queued"
        elif action == "cancel":
            allowed, target = ("queued", "downloading", "verifying", "paused", "failed"), "cancelled"
        else:
            raise HTTPException(422, "Acción de instalación desconocida")
        with self.lock:
            if not self._transition(job_id, allowed, target):
                raise HTTPException(409, "Transición no permitida desde " + job["status"])
            if action == "resume":
                self.pool.submit(self._run, job_id)
            if action == "cancel":
                # The single worker drains first; never delete a file it is writing.
                self.pool.submit(self._cleanup_cancelled, job_id)
        return self.get(job_id)

    def _cleanup_cancelled(self, job_id: str):
        if self.get(job_id)["status"] == "cancelled":
            stage = self.root / (".noble-voice-" + str(uuid.UUID(job_id)))
            if not stage.is_symlink() and stage.resolve().is_relative_to(self.root):
                shutil.rmtree(stage, ignore_errors=True)

    def _stage(self, job_id: str) -> Path:
        stage = self.root / (".noble-voice-" + str(uuid.UUID(job_id)))
        if stage.is_symlink() or not stage.resolve().is_relative_to(self.root):
            raise RuntimeError("Ruta temporal de voz no confiable")
        stage.mkdir(exist_ok=True)
        if stage.is_symlink():
            raise RuntimeError("Ruta temporal de voz no confiable")
        return stage

    def _download_one(self, job: dict, stage: Path, source: dict):
        part = stage / (source["filename"] + ".part")
        if part.is_symlink():
            raise RuntimeError("Archivo temporal simbólico no permitido")
        offset = part.stat().st_size if part.exists() else 0
        if offset > source["size"]:
            raise RuntimeError("Descarga parcial mayor que el archivo previsto")
        if offset < source["size"]:
            headers = {"Accept-Encoding": "identity"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            url = ("https://huggingface.co/" + REPO + "/resolve/" +
                   job["revision"] + "/" + quote(source["upstream"], safe="/"))
            with self.catalog.client.stream(
                    "GET", url, headers=headers, timeout=httpx.Timeout(180, connect=15)) as response:
                if response.status_code not in (200, 206):
                    response.raise_for_status()
                    raise RuntimeError("El servidor no entregó un archivo de voz completo")
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise RuntimeError("Respuesta binaria comprimida inesperadamente")
                append = offset > 0 and response.status_code == 206
                if response.status_code == 206:
                    match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",
                                         response.headers.get("content-range", ""))
                    if (match is None or int(match[1]) != offset or
                            int(match[2]) != source["size"] - 1 or
                            int(match[3]) != source["size"]):
                        raise RuntimeError("Content-Range inválido al reanudar")
                else:
                    offset = 0  # HTTP 200 ignores Range: safely redownload.
                transferred = offset
                with part.open("ab" if append else "wb") as output:
                    for chunk in response.iter_bytes(chunk_size=256 * 1024):
                        if self.get(job["id"])["status"] != "downloading":
                            return
                        transferred += len(chunk)
                        if transferred > source["size"]:
                            raise RuntimeError("Archivo supera el tamaño autorizado")
                        output.write(chunk)
                        accumulated = sum(
                            min((stage / (item["filename"] + ".part")).stat().st_size,
                                item["size"]) if (stage / (item["filename"] + ".part")).exists()
                            else 0 for item in job["sources"])
                        self._bytes(job["id"], accumulated)
            # Buffered writes to a tiny JSON sidecar may not yet be reflected
            # in stat() inside the write loop. Recount after file close.
            accumulated = sum(
                (stage / (item["filename"] + ".part")).stat().st_size
                if (stage / (item["filename"] + ".part")).exists() else 0
                for item in job["sources"])
            self._bytes(job["id"], accumulated)
        if self.get(job["id"])["status"] != "downloading":
            return
        if part.stat().st_size != source["size"]:
            raise RuntimeError("Descarga de voz incompleta")
        if source["filename"].endswith(".json"):
            raw = part.read_bytes()
            try:
                config = json.loads(raw)
            except (ValueError, UnicodeDecodeError) as exc:
                part.unlink(missing_ok=True)
                raise RuntimeError("Configuración de Piper no es JSON válido") from exc
            lang = (config.get("language") or {}).get("code") if isinstance(config, dict) else None
            if lang != VOICES[job["voice_id"]]["language"]:
                part.unlink(missing_ok=True)
                raise RuntimeError("Idioma de Piper no coincide con la voz elegida")
        else:
            with part.open("rb") as f:
                prefix = f.read(16).lstrip().lower()
            if prefix.startswith((b"<", b"{", b"[")):
                part.unlink(missing_ok=True)
                raise RuntimeError("El modelo ONNX contiene texto o HTML, no pesos")
        sha = hashlib.sha256()
        with part.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                if self.get(job["id"])["status"] != "downloading":
                    return
                sha.update(chunk)
        if source["sha256"] and sha.hexdigest() != source["sha256"].lower():
            part.unlink(missing_ok=True)
            raise RuntimeError("SHA-256 de voz distinto al catálogo")

    def _run(self, job_id: str):
        job = self.get(job_id)
        if not self._transition(job_id, ("queued",), "downloading"):
            return
        stage = None
        try:
            stage = self._stage(job_id)
            for source in job["sources"]:
                self._download_one(job, stage, source)
                if self.get(job_id)["status"] != "downloading":
                    return
            if not self._transition(job_id, ("downloading",), "verifying"):
                return
            with self.lock:
                # A concurrent pause or cancellation must win before publication,
                # never between writing the sidecar and the model.
                if self.get(job_id)["status"] != "verifying":
                    return
                model = self.root / job["voice_id"]
                config = self.root / (job["voice_id"] + ".json")
                if any(p.exists() or p.is_symlink() for p in (model, config)):
                    raise RuntimeError("Existe una voz con ese nombre; no se sobrescribirá")
                staged_model = stage / (job["voice_id"] + ".part")
                staged_config = stage / (job["voice_id"] + ".json.part")
                # Publish sidecar before ONNX: discovery requires both present.
                staged_config.replace(config)
                try:
                    staged_model.replace(model)
                except BaseException:
                    config.unlink(missing_ok=True)
                    raise
                with self._db() as db:
                    db.execute("UPDATE tts_downloads SET received_bytes=total_bytes "
                               "WHERE id=? AND status='verifying'", (job_id,))
                self._transition(job_id, ("verifying",), "completed")
        except Exception as exc:
            self._transition(job_id, ("queued", "downloading", "verifying"),
                             "failed", str(exc)[:300])
        finally:
            if stage and self.get(job_id)["status"] in ("completed", "cancelled"):
                shutil.rmtree(stage, ignore_errors=True)

    def shutdown(self):
        with self._db() as db:
            db.execute("""UPDATE tts_downloads SET status='paused',
                error='Descarga pausada al cerrar', updated_at=?
                WHERE status IN ('queued','downloading','verifying')""", (time.time(),))
        self.pool.shutdown(wait=False, cancel_futures=False)


def mount_voice_installer_routes(app, installer: VoiceInstaller):
    @app.get("/api/v1/tts/catalog")
    def catalog():
        return installer.catalog_listing()

    @app.get("/api/v1/tts/downloads")
    def list_downloads():
        return installer.list_jobs()

    @app.get("/api/v1/tts/downloads/{job_id}")
    def download_job(job_id: uuid.UUID):
        return installer.get(str(job_id))

    @app.post("/api/v1/tts/install", status_code=202)
    def install(body: VoiceInstallInput):
        return installer.start(body.voice_id)

    @app.post("/api/v1/tts/downloads/{job_id}/{action}")
    def control(job_id: uuid.UUID, action: str):
        return installer.control(str(job_id), action)
