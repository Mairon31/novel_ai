"""Resumable single-file GGUF downloads from pinned Hugging Face revisions.

HTTP can resume from a partial file only if the origin honors Range. A job
is committed as installed only after complete size and SHA256 validation
when upstream LFS SHA256 is available.
"""
from __future__ import annotations

import hashlib
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import httpx

from .catalog import CatalogError, HfCatalog, validate_repo, validate_variant
from .store import Store

MAX_FILE_BYTES = 2 * 1024**4


class DownloadManager:
    def __init__(self, store: Store, catalog: HfCatalog):
        self.store = store
        self.catalog = catalog
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="noble-model-download")
        self._future: dict[str, object] = {}
        self._lock = threading.Lock()

    def shutdown(self):
        # Do not block shutdown forever on long downloads.
        for job in self.store.downloads():
            if job["status"] in ("queued", "downloading", "verifying"):
                self.store.update_download(job["id"], status="paused", error="Descarga pausada al cerrar")
        self.pool.shutdown(wait=False, cancel_futures=True)

    def install(self, repo_id: str, revision: str, filename: str):
        validate_repo(repo_id)
        validate_variant(revision, filename)
        info = self.catalog.details(repo_id)
        if info["revision"] != revision:
            raise CatalogError(409, "El repositorio cambió de revisión. Actualiza el detalle del modelo.")
        if info["gated"]:
            raise CatalogError(403, "Este modelo requiere acceso en Hugging Face.")
        variant = next((v for v in info["variants"] if v["filename"] == filename), None)
        if variant is None or not variant["supported"]:
            raise CatalogError(400, "Variante no disponible o GGUF dividido no soportado")
        size = variant["size_bytes"]
        if size is not None and (not isinstance(size, int) or size < 0 or size > MAX_FILE_BYTES):
            raise CatalogError(400, "Tamaño de archivo inválido")
        job, created = self.store.enqueue(repo_id, revision, filename, size, variant["sha256"])
        if created:
            self._start(job["id"])
        return self.store.download(job["id"])

    def _start(self, job_id):
        with self._lock:
            future = self._future.get(job_id)
            if future is not None and not future.done():
                return
            try:
                future = self.pool.submit(self._run, job_id)
                self._future[job_id] = future
            except RuntimeError:
                # The controller is shutting down; the job can resume next run.
                self.store.update_download(job_id, status="paused",
                                           error="La aplicación se está cerrando")
                return
        # Register after releasing the lock: a finished future invokes callbacks
        # immediately, which otherwise risks reentrant deadlock.
        future.add_done_callback(lambda _: self._restart_queued(job_id))

    def _restart_queued(self, job_id):
        # Pause/resume may race a worker that is still stopping. Requeue safely
        # after the worker has actually exited; never run two workers per job.
        job = self.store.download(job_id)
        if job and job["status"] == "queued":
            self._start(job_id)

    def control(self, job_id: str, action: str):
        job = self.store.download(job_id)
        if not job:
            raise CatalogError(404, "No existe esa descarga")
        if action == "pause" and job["status"] in ("queued", "downloading"):
            self.store.update_download(job_id, status="paused")
        elif action == "cancel" and job["status"] in ("queued", "downloading", "paused", "failed"):
            self.store.update_download(job_id, status="cancelled")
        elif action == "resume" and job["status"] in ("paused", "failed", "cancelled"):
            self.store.update_download(job_id, status="queued", error=None)
            self._start(job_id)
        else:
            raise CatalogError(409, "No se puede " + action + " desde el estado " + job["status"])
        return self.store.download(job_id)

    def _run(self, job_id: str):
        job = self.store.download(job_id)
        if not job or job["status"] != "queued":
            return
        try:
            # Revalidate persisted jobs and resolved paths: the database and
            # folder tree might have been edited since the original install.
            validate_repo(job["repo_id"])
            validate_variant(job["revision"], job["filename"])
            root = self.store.models_dir.resolve()
            if not root.is_relative_to(self.store.root.resolve()):
                raise RuntimeError("Directorio de modelos fuera del espacio administrado")
            target = (root / "hf" / job["repo_id"] /
                      job["revision"] / job["filename"])
            part = Path(str(target) + ".part")
            for file in (target, part):
                if file.is_symlink() or not file.resolve().is_relative_to(root):
                    raise RuntimeError("Ruta de descarga fuera del directorio de modelos")
            target.parent.mkdir(parents=True, exist_ok=True)
            # Check again after mkdir in case the path already existed as a link.
            if not target.parent.resolve().is_relative_to(root):
                raise RuntimeError("Directorio de descarga no confiable")
            self.store.update_download(job_id, status="downloading", error=None)
            offset = part.stat().st_size if part.exists() else 0
            headers = {"Range": "bytes=" + str(offset) + "-"} if offset else {}
            url = ("https://huggingface.co/" +
                   quote(job["repo_id"], safe="/") + "/resolve/" +
                   job["revision"] + "/" + quote(job["filename"], safe=""))
            # Client stream automatically follows Hugging Face's signed CDN redirects.
            with self.catalog.client.stream("GET", url, headers=headers,
                                            timeout=httpx.Timeout(180, connect=15)) as response:
                if response.status_code in (401, 403):
                    raise RuntimeError("Acceso denegado; revisa los permisos del modelo")
                response.raise_for_status()
                continued = offset > 0 and response.status_code == 206
                if continued:
                    content_range = response.headers.get("content-range", "")
                    if not re.match(r"^bytes " + str(offset) + r"-", content_range):
                        raise RuntimeError("La respuesta de reanudación tiene un rango incorrecto")
                else:
                    # Server may ignore Range; restart cleanly to prevent corruption.
                    offset = 0
                mode = "ab" if continued else "wb"
                received = offset
                last_reported = 0.0
                with part.open(mode) as output:
                    for chunk in response.iter_bytes(chunk_size=1024 * 256):
                        state = self.store.download(job_id)["status"]
                        if state in ("paused", "cancelled"):
                            return
                        if chunk:
                            received += len(chunk)
                            if received > MAX_FILE_BYTES:
                                raise RuntimeError("Archivo supera el límite de seguridad")
                            output.write(chunk)
                        if time.monotonic() - last_reported >= .35:
                            self.store.update_download(job_id, received_bytes=received)
                            last_reported = time.monotonic()
                self.store.update_download(job_id, received_bytes=received)

            if self.store.download(job_id)["status"] in ("paused", "cancelled"):
                return
            self.store.update_download(job_id, status="verifying")
            expected_size = job["expected_size"]
            if expected_size is not None and part.stat().st_size != expected_size:
                raise RuntimeError("Tamaño incorrecto: descarga incompleta o variante modificada")
            digest = hashlib.sha256()
            with part.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            actual = digest.hexdigest()
            expected_sha = job["expected_sha256"]
            if expected_sha and actual.lower() != expected_sha.lower():
                raise RuntimeError("SHA-256 diferente al anunciado por Hugging Face")
            if self.store.download(job_id)["status"] in ("paused", "cancelled"):
                return
            part.replace(target)
            self.store.register_model(
                job, target, actual,
                "sha256_verified" if expected_sha else "local_hash_only",
            )
            self.store.update_download(job_id, status="completed",
                                       received_bytes=target.stat().st_size, error=None)
        except Exception as exc:
            status = self.store.download(job_id)
            if status and status["status"] not in ("paused", "cancelled"):
                self.store.update_download(job_id, status="failed", error=str(exc)[:600])
