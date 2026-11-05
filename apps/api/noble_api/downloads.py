"""Resumable single-file GGUF downloads from pinned Hugging Face revisions.

HTTP can resume from a partial file only if the origin honors Range. A job
is committed as installed only after complete size and SHA256 validation
when upstream LFS SHA256 is available.
"""
from __future__ import annotations

import hashlib
import logging
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
LOG = logging.getLogger(__name__)


class DownloadManager:
    def __init__(self, store: Store, catalog: HfCatalog):
        self.store = store
        self.catalog = catalog
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="noble-model-download")
        self._future: dict[str, object] = {}
        self._lock = threading.Lock()
        # No network calls or model loading at startup. Reconcile only jobs
        # referenced by SQLite, and leave recovered bytes untrusted until
        # the user resumes and the normal SHA validation succeeds.
        self.recovery_report = self.reconcile_interrupted()

    def reconcile_interrupted(self) -> dict[str, int]:
        report = {"recovered": 0, "conflicts": 0, "skipped": 0}
        for job in self.store.recovery_candidates():
            try:
                validate_repo(job["repo_id"])
                validate_variant(job["revision"], job["filename"])
                root = self.store.models_dir.resolve()
                if not root.is_relative_to(self.store.root.resolve()):
                    raise ValueError("Directorio de modelos fuera del espacio administrado")
                target = root / "hf" / job["repo_id"] / job["revision"] / job["filename"]
                part = Path(str(target) + ".part")
                # Never mutate a symlink, a path outside root, or an unrelated
                # installed file. The known DB job is the only discovery input.
                if any(p.is_symlink() or not p.resolve().is_relative_to(root)
                       for p in (target, part)):
                    raise ValueError("Ruta de recuperación no confiable")
                if not target.exists():
                    report["skipped"] += 1
                    continue
                if not target.is_file() or part.exists() or self.store.installed_for_job(job):
                    raise ValueError("Conflicto entre GGUF final, parcial o modelo ya instalado")
                if self.store.restore_orphaned_download(job["id"], target, part):
                    report["recovered"] += 1
                    LOG.info("Recuperada descarga interrumpida %s para verificar", job["id"])
                else:
                    report["skipped"] += 1
            except (ValueError, OSError) as exc:
                report["conflicts"] += 1
                self.store.transition_download(
                    job["id"], ("paused", "failed"), "failed",
                    error=("Recuperación segura pendiente: " + str(exc))[:600],
                )
                LOG.warning("No se recuperó descarga %s: %s", job["id"], exc)
        return report

    def shutdown(self):
        # Do not block shutdown forever on long downloads.
        for job in self.store.downloads():
            self.store.transition_download(
                job["id"], ("queued", "downloading", "verifying"), "paused",
                error="Descarga pausada al cerrar",
            )
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
        transitions = {
            "pause": (("queued", "downloading", "verifying"), "paused"),
            "cancel": (("queued", "downloading", "verifying", "paused", "failed"), "cancelled"),
            "resume": (("paused", "failed", "cancelled"), "queued"),
        }
        if action not in transitions:
            raise CatalogError(400, "Acción de descarga desconocida")
        permitted, destination = transitions[action]
        changed = self.store.transition_download(
            job_id, permitted, destination,
            **({"error": None} if action == "resume" else {}),
        )
        if not changed:
            actual = self.store.download(job_id)
            raise CatalogError(409,
                "No se puede " + action + " desde el estado " +
                (actual["status"] if actual else "inexistente"))
        if action == "resume":
            self._start(job_id)
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
            # A failed crash-reconciliation conflict must not be bypassed by
            # manually pressing Resume: never overwrite the existing final.
            if target.exists() or target.is_symlink():
                raise RuntimeError("Ya existe un GGUF final; resolver conflicto antes de reanudar")
            if not self.store.transition_download(
                    job_id, ("queued",), "downloading", error=None):
                return
            offset = part.stat().st_size if part.exists() else 0
            expected_size = job["expected_size"]
            if expected_size is not None and offset > expected_size:
                raise RuntimeError("Archivo parcial excede el tamaño publicado")
            # A fully transferred .part paused while hashing must be verified
            # directly. Asking HTTP for Range bytes=<EOF>- would return 416.
            ready_for_verification = (expected_size is not None and
                                      offset == expected_size and offset > 0)
            if not ready_for_verification:
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
                    if response.status_code == 206 and not continued:
                        raise RuntimeError("Respuesta HTTP 206 inesperada sin petición Range")
                    expected_chunk_bytes = None
                    if response.status_code == 206:
                        # A bare prefix check ("bytes 20-") is insufficient: a
                        # truncated or forged range can silently corrupt a file.
                        content_range = response.headers.get("content-range", "").strip()
                        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+|\*)", content_range)
                        expected_offset = offset if continued else 0
                        if not match:
                            raise RuntimeError("Content-Range ausente o con formato inválido")
                        start, end = int(match[1]), int(match[2])
                        total = None if match[3] == "*" else int(match[3])
                        if (start != expected_offset or end < start or
                                (total is not None and (total <= end or total <= 0)) or
                                (job["expected_size"] is not None and total is not None and
                                 total != job["expected_size"])):
                            raise RuntimeError("La respuesta de reanudación tiene un rango incorrecto")
                        expected_chunk_bytes = end - start + 1
                        length = response.headers.get("content-length")
                        if length is not None and (not length.isdigit() or
                                                   int(length) != expected_chunk_bytes):
                            raise RuntimeError("Content-Length no coincide con Content-Range")
                    else:
                        # Server may ignore Range with HTTP 200; restart cleanly.
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
                    if (expected_chunk_bytes is not None and
                            received - offset != expected_chunk_bytes):
                        raise RuntimeError("El servidor entregó un fragmento Range incompleto")
                    self.store.update_download(job_id, received_bytes=received)
    
            if not self.store.transition_download(
                    job_id, ("downloading",), "verifying"):
                return
            expected_size = job["expected_size"]
            if expected_size is not None and part.stat().st_size != expected_size:
                raise RuntimeError("Tamaño incorrecto: descarga incompleta o variante modificada")
            digest = hashlib.sha256()
            last_check = 0.0
            with part.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    # Large GGUF files can require substantial hash time.
                    # Pause/cancel is checked at least every 100 ms.
                    if time.monotonic() - last_check >= 0.1:
                        if self.store.download(job_id)["status"] != "verifying":
                            return
                        last_check = time.monotonic()
                    digest.update(chunk)
            actual = digest.hexdigest()
            expected_sha = job["expected_sha256"]
            if expected_sha and actual.lower() != expected_sha.lower():
                raise RuntimeError("SHA-256 diferente al anunciado por Hugging Face")
            self.store.complete_download(
                job, part, target, actual,
                "sha256_verified" if expected_sha else "local_hash_only",
            )
        except Exception as exc:
            self.store.transition_download(
                job_id, ("queued", "downloading", "verifying"), "failed",
                error=str(exc)[:600],
            )
