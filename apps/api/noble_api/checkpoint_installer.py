"""Verified, explicit Hugging Face safetensors checkpoint installer for ComfyUI.

Writes only under Noble-owned models/comfyui/checkpoints. The optional ComfyUI
extra-model-paths file is generated inside this directory; the user must pass
that file to ComfyUI at startup. Downloading a model never loads it in GPU.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import struct
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .catalog import CatalogError, HfCatalog, HEX_SHA256, REVISION, validate_repo
from .store import Store

CHECKPOINT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+()-]{0,160}\.safetensors$", re.I)
MAX_CHECKPOINT = 24 * 1024**3
MIN_CHECKPOINT = 64
TERMINAL = ("completed", "cancelled")


class CheckpointLookup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repo_id: str = Field(min_length=3, max_length=195)


class CheckpointInstall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repo_id: str = Field(min_length=3, max_length=195)
    filename: str = Field(min_length=14, max_length=180)
    revision: str = Field(pattern=r"^[a-fA-F0-9]{40}$")


def verify_safetensors(path: Path) -> None:
    """Reject LFS text pointers, HTML, truncated files, and invalid tensor offsets."""
    size = path.stat().st_size
    with path.open("rb") as stream:
        start = stream.read(8)
        if len(start) != 8:
            raise ValueError("Checkpoint truncado")
        length = struct.unpack("<Q", start)[0]
        if length < 2 or length > 16 * 1024**2 or length > size - 8:
            raise ValueError("Invalid safetensors header")
        try:
            header = json.loads(stream.read(length))
        except (UnicodeError, ValueError) as exc:
            raise ValueError("Safetensors header is not valid JSON") from exc
    if not isinstance(header, dict):
        raise ValueError("Safetensors header contains no tensors")
    entries = [(name, v) for name, v in header.items() if name != "__metadata__"]
    if not entries:
        raise ValueError("Empty safetensors checkpoint")
    data_length = size - length - 8
    for name, entry in entries:
        if not isinstance(name, str) or not isinstance(entry, dict):
            raise ValueError("Invalid safetensors tensor")
        offsets = entry.get("data_offsets")
        shape = entry.get("shape")
        if (not isinstance(offsets, list) or len(offsets) != 2 or
                any(type(x) is not int for x in offsets) or
                not 0 <= offsets[0] <= offsets[1] <= data_length or
                not isinstance(entry.get("dtype"), str) or
                not isinstance(shape, list) or
                any(type(x) is not int or x < 0 for x in shape)):
            raise ValueError("Invalid safetensors tensor offset or dimensions")


class CheckpointInstaller:
    def __init__(self, store: Store, catalog: HfCatalog):
        self.store = store
        self.catalog = catalog
        intended = store.models_dir / "comfyui"
        self.base = intended.resolve()
        if intended.is_symlink() or not self.base.is_relative_to(store.models_dir.resolve()):
            raise RuntimeError("ComfyUI model path is outside Noble AI storage")
        self.root = self.base / "checkpoints"
        if self.root.is_symlink():
            raise RuntimeError("Linked model directories are not managed")
        self.root.mkdir(parents=True, exist_ok=True)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="noble-image-checkpoints")
        self.lock = threading.Lock()
        with store._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS image_checkpoint_downloads(
                id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, filename TEXT NOT NULL,
                revision TEXT NOT NULL, expected_size INTEGER NOT NULL,
                sha256 TEXT NOT NULL, status TEXT NOT NULL,
                received_bytes INTEGER NOT NULL, error TEXT,
                created_at REAL NOT NULL, updated_at REAL NOT NULL)""")
            db.execute("""UPDATE image_checkpoint_downloads
                          SET status='paused', error='Interrupted; resume to verify'
                          WHERE status IN ('queued','downloading','verifying')""")

    def _path(self, repo_id: str, filename: str) -> Path:
        validate_repo(repo_id)
        if not CHECKPOINT.fullmatch(filename) or ".." in filename:
            raise HTTPException(422, "Only individual .safetensors files at the repository root are supported")
        target = self.root / repo_id / filename
        # A local symlink in an intermediate directory must not redirect a
        # background download or publication outside Noble-owned storage.
        for parent in (self.root, self.root / repo_id.split("/")[0],
                       self.root / repo_id):
            if parent.is_symlink() or not parent.resolve().is_relative_to(self.root.resolve()):
                raise HTTPException(409, "Untrusted checkpoint path")
        if target.is_symlink() or not target.resolve().is_relative_to(self.root.resolve()):
            raise HTTPException(409, "Untrusted checkpoint path")
        return target

    def _staging(self, job_id: str) -> Path:
        folder = self.base / (".noble-image-" + str(uuid.UUID(job_id)))
        if folder.is_symlink() or not folder.resolve().is_relative_to(self.base):
            raise RuntimeError("Untrusted temporary path")
        folder.mkdir(exist_ok=True)
        return folder

    def _row(self, job_id: str) -> dict | None:
        with self.store._conn() as db:
            item = db.execute("SELECT * FROM image_checkpoint_downloads WHERE id=?",
                              (job_id,)).fetchone()
        return dict(item) if item else None

    def get(self, job_id: str) -> dict:
        item = self._row(job_id)
        if item is None:
            raise HTTPException(404, "Unknown checkpoint download")
        return item

    def _transition(self, job_id: str, allowed: tuple[str, ...],
                    status: str, error: str | None = None) -> bool:
        with self.store._conn() as db:
            marks = ",".join("?" for _ in allowed)
            changed = db.execute(
                f"""UPDATE image_checkpoint_downloads SET status=?,error=?,updated_at=?
                    WHERE id=? AND status IN ({marks})""",
                (status, error, time.time(), job_id, *allowed))
            return changed.rowcount == 1

    def _progress(self, job_id: str, received: int):
        with self.store._conn() as db:
            db.execute("""UPDATE image_checkpoint_downloads
                          SET received_bytes=?,updated_at=?
                          WHERE id=? AND status='downloading'""",
                       (received, time.time(), job_id))

    def inspect(self, repo_id: str) -> dict:
        validate_repo(repo_id)
        info = self.catalog._get("/api/models/" + quote(repo_id, safe="/"),
                                 {"blobs": "true"})
        if not isinstance(info, dict) or not REVISION.fullmatch(str(info.get("sha", ""))):
            raise CatalogError(502, "Invalid Hugging Face revision")
        if info.get("gated") or info.get("private"):
            raise CatalogError(403, "Checkpoint is private or requires access permissions")
        revision = info["sha"]
        models = []
        for item in info.get("siblings") or []:
            if not isinstance(item, dict):
                continue
            name = item.get("rfilename")
            if not isinstance(name, str) or not CHECKPOINT.fullmatch(name) or ".." in name:
                continue
            size = item.get("size") or (item.get("lfs") or {}).get("size")
            digest = (item.get("lfs") or {}).get("oid") or item.get("sha256")
            digest = digest.removeprefix("sha256:") if isinstance(digest, str) else ""
            # A pinned revision alone is not enough for unverified executables
            # or large model files: SHA256 must be known before installation.
            if type(size) is not int or not MIN_CHECKPOINT <= size <= MAX_CHECKPOINT:
                continue
            if not HEX_SHA256.fullmatch(digest):
                continue
            target = self._path(repo_id, name)
            models.append({"filename": name, "size_bytes": size, "sha256": digest.lower(),
                           "installed": target.is_file() and not target.is_symlink(),
                           "model_card": "https://huggingface.co/" + repo_id})
        return {
            "repo_id": repo_id, "revision": revision,
            "license": (info.get("cardData") or {}).get("license") or "sin verificar",
            "models": models[:40],
            "note": "Only root-level safetensors files with a published SHA-256 are supported. ComfyUI compatibility is not guaranteed.",
        }

    def path_config(self) -> dict:
        config = self.base / "noble_extra_model_paths.yaml"
        # JSON-encoded string scalars are valid YAML syntax and safely quote
        # Windows paths; no YAML parser or arbitrary user-supplied paths needed.
        body = "noble_ai:\n  base_path: " + json.dumps(str(self.base)) + "\n  checkpoints: checkpoints\n"
        if config.is_symlink():
            raise HTTPException(409, "Configuration symlinks will not be modified")
        if not config.exists() or config.read_text(encoding="utf-8") != body:
            config.write_text(body, encoding="utf-8")
        return {"model_dir": str(self.root), "config_path": str(config),
                "comfyui_argument": ["--extra-model-paths-config", str(config)],
                "requires_runtime_restart": True}

    def installed(self) -> dict:
        with self.store._conn() as db:
            rows = db.execute("""SELECT * FROM image_checkpoint_downloads
                                 WHERE status='completed'
                                 ORDER BY created_at DESC LIMIT 100""").fetchall()
        models = []
        for row in rows:
            target = self._path(row["repo_id"], row["filename"])
            if target.is_file() and not target.is_symlink() and target.stat().st_size == row["expected_size"]:
                models.append({"repo_id": row["repo_id"], "filename": row["filename"],
                               "revision": row["revision"], "size_bytes": row["expected_size"],
                               "checkpoint_name": row["repo_id"] + "/" + row["filename"]})
        return {"models": models, **self.path_config()}

    def jobs(self) -> dict:
        with self.store._conn() as db:
            rows = db.execute("""SELECT id FROM image_checkpoint_downloads
                                 ORDER BY created_at DESC LIMIT 30""").fetchall()
        return {"downloads": [self.get(row["id"]) for row in rows]}

    def start(self, body: CheckpointInstall) -> dict:
        selected = self.inspect(body.repo_id)
        if selected["revision"] != body.revision:
            raise HTTPException(409, "Catalog revision changed; refresh the catalog")
        file = next((x for x in selected["models"] if x["filename"] == body.filename), None)
        if file is None:
            raise HTTPException(422, "Model has no verifiable SHA-256 or size in the catalog")
        target = self._path(body.repo_id, body.filename)
        free_bytes = shutil.disk_usage(self.base).free
        reserve = min(128 * 1024 * 1024, file["size_bytes"] // 20)
        if free_bytes < file["size_bytes"] + reserve:
            raise HTTPException(507, "Insufficient space to verify checkpoint")
        if target.is_symlink() or target.exists():
            raise HTTPException(409, "Checkpoint already exists and will not be overwritten")
        with self.lock:
            with self.store._conn() as db:
                active = db.execute("""SELECT id FROM image_checkpoint_downloads
                    WHERE repo_id=? AND filename=? AND status IN
                    ('queued','downloading','verifying','paused')
                    LIMIT 1""", (body.repo_id, body.filename)).fetchone()
                if active:
                    raise HTTPException(409, "An active or paused download already exists")
                now, job_id = time.time(), str(uuid.uuid4())
                db.execute("""INSERT INTO image_checkpoint_downloads VALUES
                           (?,?,?,?,?,?,?,?,?,?,?)""",
                           (job_id, body.repo_id, body.filename, body.revision,
                            file["size_bytes"], file["sha256"],
                            "queued", 0, None, now, now))
            self.pool.submit(self._run, job_id)
        return self.get(job_id)

    def control(self, job_id: str, action: str) -> dict:
        job = self.get(job_id)
        options = {
            "pause": (("queued", "downloading", "verifying"), "paused"),
            "resume": (("paused", "failed"), "queued"),
            "cancel": (("queued", "downloading", "verifying", "paused", "failed"), "cancelled"),
        }
        if action not in options:
            raise HTTPException(422, "Unsupported download action")
        allowed, new_status = options[action]
        with self.lock:
            if not self._transition(job_id, allowed, new_status):
                raise HTTPException(409, "Invalid download state transition from " + job["status"])
            if action == "resume":
                self.pool.submit(self._run, job_id)
            if action == "cancel":
                # Queued after the active transfer to avoid deleting open files.
                self.pool.submit(self._cleanup, job_id)
        return self.get(job_id)

    def _cleanup(self, job_id: str):
        if self.get(job_id)["status"] == "cancelled":
            folder = self.base / (".noble-image-" + job_id)
            if not folder.is_symlink() and folder.resolve().is_relative_to(self.base):
                shutil.rmtree(folder, ignore_errors=True)

    def _download(self, job: dict, part: Path):
        if part.is_symlink():
            raise ValueError("Symbolic links will not be written to")
        offset = part.stat().st_size if part.exists() else 0
        size = job["expected_size"]
        if offset > size:
            raise ValueError("Partial download is too large")
        if offset < size:
            headers = {"Accept-Encoding": "identity"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            url = ("https://huggingface.co/" + job["repo_id"] + "/resolve/" +
                   job["revision"] + "/" + quote(job["filename"]))
            with self.catalog.client.stream(
                    "GET", url, headers=headers,
                    timeout=httpx.Timeout(180, connect=15)) as response:
                if response.status_code not in (200, 206):
                    response.raise_for_status()
                    raise ValueError("No checkpoint was received")
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise ValueError("Unexpected compressed binary checkpoint response")
                append = False
                if response.status_code == 206:
                    match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",
                                         response.headers.get("content-range", ""))
                    if (match is None or int(match[1]) != offset or
                            int(match[2]) != size - 1 or int(match[3]) != size):
                        raise ValueError("Invalid Content-Range")
                    append = offset > 0
                else:
                    offset = 0  # Origin ignored Range; rewrite safely.
                transferred = offset
                with part.open("ab" if append else "wb") as destination:
                    for chunk in response.iter_bytes(chunk_size=256 * 1024):
                        if self.get(job["id"])["status"] != "downloading":
                            return
                        transferred += len(chunk)
                        if transferred > size:
                            raise ValueError("Response exceeds the advertised size")
                        destination.write(chunk)
                        self._progress(job["id"], transferred)
        if self.get(job["id"])["status"] != "downloading":
            return
        if part.stat().st_size != size:
            raise ValueError("Incomplete checkpoint download")

    def _run(self, job_id: str):
        if not self._transition(job_id, ("queued",), "downloading"):
            return
        folder = None
        try:
            job = self.get(job_id)
            folder = self._staging(job_id)
            part = folder / (job["filename"] + ".part")
            self._download(job, part)
            if self.get(job_id)["status"] != "downloading":
                return
            digest = hashlib.sha256()
            with part.open("rb") as stream:
                for piece in iter(lambda: stream.read(1024 * 1024), b""):
                    if self.get(job_id)["status"] != "downloading":
                        return
                    digest.update(piece)
            if digest.hexdigest() != job["sha256"].lower():
                part.unlink(missing_ok=True)
                raise ValueError("Checkpoint SHA-256 does not match Hugging Face")
            verify_safetensors(part)
            if not self._transition(job_id, ("downloading",), "verifying"):
                return
            with self.lock:
                if self.get(job_id)["status"] != "verifying":
                    return
                target = self._path(job["repo_id"], job["filename"])
                if target.is_symlink() or target.exists():
                    raise ValueError("Conflict: checkpoint already exists")
                target.parent.mkdir(parents=True, exist_ok=True)
                # Atomic creation that never replaces a file created by
                # another process between our exists() check and publication.
                # Staging and destination share Noble's own model filesystem.
                os.link(part, target)
                part.unlink()
                with self.store._conn() as db:
                    db.execute("""UPDATE image_checkpoint_downloads
                                  SET received_bytes=expected_size
                                  WHERE id=? AND status='verifying'""", (job_id,))
                self._transition(job_id, ("verifying",), "completed")
        except Exception as exc:
            self._transition(job_id, ("queued", "downloading", "verifying"),
                             "failed", str(exc)[:300])
        finally:
            if folder and self.get(job_id)["status"] in TERMINAL:
                shutil.rmtree(folder, ignore_errors=True)

    def shutdown(self):
        with self.store._conn() as db:
            db.execute("""UPDATE image_checkpoint_downloads SET
                          status='paused', error='Download paused on shutdown'
                          WHERE status IN ('queued','downloading','verifying')""")
        self.pool.shutdown(wait=False, cancel_futures=False)


def mount_checkpoint_routes(app, installer: CheckpointInstaller):
    @app.get("/api/v1/images/checkpoints/lookup")
    def lookup(repo_id: str):
        return installer.inspect(repo_id)

    @app.get("/api/v1/images/checkpoints/installed")
    def installed():
        return installer.installed()

    @app.get("/api/v1/images/checkpoints/downloads")
    def downloads():
        return installer.jobs()

    @app.get("/api/v1/images/checkpoints/downloads/{job_id}")
    def download(job_id: uuid.UUID):
        return installer.get(str(job_id))

    @app.post("/api/v1/images/checkpoints/install", status_code=202)
    def install(body: CheckpointInstall):
        return installer.start(body)

    @app.post("/api/v1/images/checkpoints/downloads/{job_id}/{action}")
    def control(job_id: uuid.UUID, action: str):
        return installer.control(str(job_id), action)
