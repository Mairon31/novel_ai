"""Noble AI first playable narrative slice.

External Ollama and KoboldCpp adapters, real model streaming, and durable story
turns. No fake completions, local network URLs only, no GPU models at API startup.
World-state extraction/branching and managed KoboldCpp startup are later phases.
"""
from __future__ import annotations

import asyncio
from contextlib import aclosing
import json
import logging
import os
from pathlib import Path
import shutil
import sqlite3
import time
import uuid
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .store import Store
from .secrets import Secrets

LOG = logging.getLogger(__name__)


DEFAULT_LLM = {
    "provider": "ollama",
    "base_url": "http://127.0.0.1:11434",
    "model": "",
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 450,
    "num_ctx": 4096,
    "device": "auto",
    "top_k": 40,
    "repetition_penalty": 1.0,
    "reasoning_mode": "auto",
    "worker_id": "",
}

PROMPT = (
    "Eres el narrador de una novela visual interactiva. Respeta siempre "
    "el idioma de salida establecido en las preferencias. Mantén continuidad, "
    "personalidades y consecuencias de la historia. Narra acciones de NPC, "
    "escenarios y sus diálogos; nunca decidas lo que hará, sentirá o dirá "
    "el protagonista controlado por el jugador. No repitas ni resumas "
    "constantemente. Termina dejando espacio a la intervención del jugador."
)


def validate_endpoint(value: str) -> str:
    """Block remote services, custom paths and credentials in this local-only MVP."""
    try:
        u = urlsplit(value.strip())
        if (u.scheme != "http" or u.hostname not in {"localhost", "127.0.0.1", "::1"}
                or u.username or u.password or u.path not in {"", "/"}
                or u.query or u.fragment or u.port is None
                or not (1 <= u.port <= 65535)):
            raise ValueError("Solo se permiten endpoints HTTP locales con puerto, sin rutas")
    except (ValueError, AttributeError) as exc:
        raise ValueError("URL no admitida. Usa http://127.0.0.1:11434 o :5001") from exc
    # Never store a path to avoid accidental duplicate /v1 segments.
    return value.strip().rstrip("/")


class LlmSettings(BaseModel):
    provider: str = "ollama"
    base_url: str = "http://127.0.0.1:11434"
    model: str = Field(default="", max_length=180)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)
    max_tokens: int = Field(default=450, ge=50, le=2048)
    num_ctx: int = Field(default=4096, ge=512, le=32768)
    device: str = "auto"  # Ollama supports cpu via num_gpu=0
    top_k: int = Field(default=40, ge=0, le=200)
    repetition_penalty: float = Field(default=1.0, ge=0.5, le=2.0)
    reasoning_mode: str = "auto"
    worker_id: str = ""


class ForkRequest(BaseModel):
    until_turn_id: uuid.UUID | None = None


class CanonChange(BaseModel):
    canon: str = Field(default='', max_length=5000)


class CreateStory(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    premise: str = Field(min_length=10, max_length=4000)
    protagonist_name: str = Field(default="Protagonista", min_length=1, max_length=60)


class TurnRequest(BaseModel):
    input_text: str = Field(default="", max_length=3000)
    mode: str = "do"
    request_id: uuid.UUID


def encode_event(event: str, payload: dict) -> str:
    return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


class NarrativeService:
    def __init__(self, store: Store, transport: httpx.AsyncBaseTransport | None = None,
                 secrets: Secrets | None = None, preferences=None, workers=None):
        self.store = store
        self.secrets = secrets or Secrets()
        self.workers = workers
        self.visual = None  # injected after VisualState initializes its SQLite tables
        self.resources = None  # injected per app for local GPU operation arbitration
        self.creator = None
        self.lorebook = None  # author-controlled conditional world knowledge
        self.world = None  # author-confirmed state and atomic turn snapshots
        self.creator_media = None  # optional creator-owned story bible and NPC guidance
        self.preferences = preferences or (lambda: {"target_language": "es-419", "narration_style": "natural", "translation_mode": "off"})
        self.transport = transport
        self.locks: dict[str, asyncio.Lock] = {}
        # Requests registered before StreamingResponse starts can be cancelled
        # even when the model is still waiting for its first token.
        self._active_generations: dict[tuple[str, str], asyncio.Event] = {}
        with store._conn() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS llm_preferences (
                id INTEGER PRIMARY KEY CHECK(id=1), settings_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, premise TEXT NOT NULL,
                created_at REAL NOT NULL, updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS story_turns (
                id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
                request_id TEXT NOT NULL, mode TEXT NOT NULL, input_text TEXT NOT NULL,
                assistant_text TEXT NOT NULL, model TEXT NOT NULL,
                created_at REAL NOT NULL,
                UNIQUE(story_id, request_id)
            );
            CREATE INDEX IF NOT EXISTS idx_story_turns_story
                ON story_turns(story_id, created_at, id);
            """)
            fields = [row[1] for row in db.execute("PRAGMA table_info(stories)")]
            if "protagonist_name" not in fields:
                db.execute("ALTER TABLE stories ADD COLUMN protagonist_name TEXT NOT NULL DEFAULT 'Protagonista'")
            if "canon" not in fields:
                db.execute("ALTER TABLE stories ADD COLUMN canon TEXT NOT NULL DEFAULT ''")
            if "origin_story_id" not in fields:
                db.execute("ALTER TABLE stories ADD COLUMN origin_story_id TEXT")
            if "origin_turn_id" not in fields:
                db.execute("ALTER TABLE stories ADD COLUMN origin_turn_id TEXT")
            if "cover_asset_id" not in fields:
                db.execute("ALTER TABLE stories ADD COLUMN cover_asset_id TEXT")
            db.execute("INSERT OR IGNORE INTO llm_preferences VALUES (1,?)",
                       (json.dumps(DEFAULT_LLM),))

    def config(self) -> dict:
        with self.store._conn() as db:
            row = db.execute("SELECT settings_json FROM llm_preferences WHERE id=1").fetchone()
            return {**DEFAULT_LLM, **json.loads(row[0])}

    def configure(self, settings: LlmSettings) -> dict:
        data = settings.model_dump()
        if data["provider"] not in ("ollama", "koboldcpp", "openrouter", "worker"):
            raise ValueError("El proveedor debe ser Ollama, KoboldCpp u OpenRouter")
        if data["reasoning_mode"] not in ("auto", "off"):
            raise ValueError("Modo de razonamiento no admitido")
        if data["device"] not in ("auto", "cpu"):
            raise ValueError("Dispositivo no soportado; Auto o CPU")
        if data["provider"] == "koboldcpp" and data["device"] != "auto":
            raise ValueError("KoboldCpp configura GPU/CPU al iniciar el ejecutable, no por API")
        if data["provider"] == "openrouter":
            if data["device"] != "auto":
                raise ValueError("OpenRouter administra el hardware en la nube")
            data["base_url"] = "https://openrouter.ai/api/v1"
        elif data["provider"] == "worker":
            if self.workers is None or not data["worker_id"]:
                raise ValueError("Selecciona primero un worker registrado")
            endpoint, _ = self.workers.endpoint(data["worker_id"])
            if data["device"] != "auto":
                raise ValueError("El worker configura sus propios recursos de GPU")
            data["base_url"] = endpoint
        else:
            data["base_url"] = validate_endpoint(data["base_url"])
        data["model"] = data["model"].strip()
        with self.store._conn() as db:
            db.execute("UPDATE llm_preferences SET settings_json=? WHERE id=1",
                       (json.dumps(data),))
        return self.config()

    async def _get_json(self, url: str, headers: dict | None = None) -> dict:
        async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                                     timeout=httpx.Timeout(8)) as client:
            res = await client.get(url, headers=headers, follow_redirects=False)
            res.raise_for_status()
            data = res.json()
            if not isinstance(data, dict):
                raise ValueError("Formato de proveedor incorrecto")
            return data

    async def available_models(self) -> dict:
        cfg = self.config()
        if cfg["provider"] == "worker":
            if self.workers is None:
                return {"online": False, "provider": "worker", "models": [],
                        "selected": cfg["model"], "error": "No existe registro de workers"}
            result = await self.workers.probe(cfg["worker_id"])
            return {"online": result["online"], "provider": "worker", "models": result["models"],
                    "selected": cfg["model"], "device": "auto", "error": result.get("error")}
        remote = cfg["provider"] == "openrouter"
        base = "https://openrouter.ai/api/v1" if remote else validate_endpoint(cfg["base_url"])
        route = "/api/tags" if cfg["provider"] == "ollama" else "/models" if remote else "/v1/models"
        token = self.secrets.read() if remote else ""
        if remote and not token:
            return {"online": False, "provider": "openrouter", "models": [],
                    "selected": cfg["model"], "device": "auto",
                    "error": "Configura una clave OpenRouter antes de consultar modelos"}
        try:
            data = await self._get_json(base + route,
                headers={"Authorization": "Bearer " + token} if remote else None)
            raw = data.get("models", []) if cfg["provider"] == "ollama" else data.get("data", [])
            names = [m.get("name" if cfg["provider"] == "ollama" else "id")
                     for m in raw if isinstance(m, dict)]
            names = [str(m) for m in names if isinstance(m, str) and m]
            return {"online": True, "provider": cfg["provider"], "models": names[:150],
                    "selected": cfg["model"], "device": cfg["device"]}
        except (httpx.HTTPError, ValueError, OSError) as exc:
            return {"online": False, "provider": cfg["provider"], "models": [],
                    "selected": cfg["model"], "device": cfg["device"],
                    "error": str(exc)[:240]}

    def create_story(self, title: str, premise: str, protagonist_name: str = "Protagonista") -> dict:
        story_id, now = str(uuid.uuid4()), time.time()
        with self.store._conn() as db:
            db.execute("INSERT INTO stories (id,title,premise,created_at,updated_at,protagonist_name) VALUES (?,?,?,?,?,?)",
                       (story_id, title.strip(), premise.strip(), now, now, protagonist_name.strip()))
        return self.get_story(story_id)

    def stories(self) -> list[dict]:
        with self.store._conn() as db:
            return [self.with_art(dict(r)) for r in db.execute(
                "SELECT * FROM stories ORDER BY updated_at DESC, id LIMIT 250")]

    def get_story(self, story_id: str) -> dict | None:
        with self.store._conn() as db:
            row = db.execute("SELECT * FROM stories WHERE id=?", (story_id,)).fetchone()
            return self.with_art(dict(row)) if row else None

    def with_art(self, story: dict) -> dict:
        art = self.store.root / "story-assets" / story["id"] / "scene.webp"
        story["scene_image_url"] = ("/api/v1/stories/" + story["id"] +
                                    "/scene-image") if art.is_file() else None
        story["cover_image_url"] = None
        # A creator-owned cover stays stable when the active narrative scene changes.
        cover_id = story.get("cover_asset_id")
        if cover_id:
            cover_path = (self.store.root / "story-assets" / story["id"] /
                          "creator" / (cover_id + ".webp"))
            if cover_path.is_file() and not cover_path.is_symlink():
                story["cover_image_url"] = ("/api/v1/stories/" + story["id"] +
                    "/creator/assets/" + cover_id + "/file")
        return story

    def set_protagonist(self, story_id: str, name: str) -> dict:
        with self.store._conn() as db:
            db.execute("UPDATE stories SET protagonist_name=?,updated_at=? WHERE id=?",
                       (name.strip(), time.time(), story_id))
        return self.get_story(story_id)

    def _fork_stage_root(self):
        """Directory holding only Noble-created UUID branch transaction markers."""
        root = self.store.root / "fork-staging"
        if root.is_symlink() or not root.resolve().is_relative_to(self.store.root):
            raise ValueError("Directorio de staging de ramas no confiable")
        return root

    @staticmethod
    def _fsync_directory(folder: Path) -> bool:
        """Flush directory metadata on POSIX; Windows has no portable dir fsync.

        False means the platform lacks this primitive, not that a crash-safe
        durability guarantee was established.
        """
        if os.name != "posix":
            return False
        if folder.is_symlink() or not folder.is_dir():
            raise ValueError("Directorio no confiable al sincronizar rama")
        flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        flags |= getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(folder, flags)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        return True

    def _sync_fork_files(self, folder: Path) -> int:
        """Flush copied branch files and their directory entries before COMMIT.

        SQLite is not a filesystem transaction. This reduces the crash window
        on POSIX and keeps the staging marker durable before the branch becomes
        visible. It does not promise resistance to storage-controller faults.
        """
        if not folder.exists() and not folder.is_symlink():
            return 0  # A valid branch may have no media files.
        assets_root = self.store.root / "story-assets"
        if (folder.is_symlink() or not folder.is_dir() or
                assets_root.is_symlink() or
                folder.resolve().parent != assets_root.resolve()):
            raise ValueError("Directorio de rama no confiable al sincronizar archivos")
        dirs = [folder]
        count = 0
        # Only traverse the new UUID-scoped branch, never user directories.
        for path in sorted(folder.rglob("*"),
                           key=lambda item: len(item.parts), reverse=True):
            if path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()):
                raise ValueError("Enlace simbólico inesperado en archivos de rama")
            if path.is_dir():
                dirs.append(path)
            elif path.is_file():
                mode = "rb+" if os.name == "nt" else "rb"
                with path.open(mode) as stream:
                    os.fsync(stream.fileno())
                count += 1
            else:
                raise ValueError("Tipo de archivo no permitido en rama")
        for directory in dirs:
            self._fsync_directory(directory)
        self._fsync_directory(assets_root)
        return count

    def recover_incomplete_forks(self) -> dict[str, int]:
        """Reconcile branches abandoned by process termination after file copy.

        Markers are written while BEGIN IMMEDIATE holds the DB writer lock.
        Recovery acquires the same lock before inspecting marker ownership,
        so it cannot delete an in-progress fork from another process.
        Never delete an unmarked directory or an already committed story.
        """
        report = {"removed_orphans": 0, "retained_stories": 0, "conflicts": 0}
        staging = self._fork_stage_root()
        if not staging.is_dir():
            return report
        assets_root = self.store.root / "story-assets"
        if assets_root.is_symlink():
            raise ValueError("Directorio de historias no confiable")
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            for marker in staging.glob("*.pending"):
                candidate = marker.name.removesuffix(".pending")
                try:
                    if (str(uuid.UUID(candidate)) != candidate or
                            marker.is_symlink() or not marker.is_file() or
                            marker.read_text(encoding="utf-8").strip() != candidate):
                        raise ValueError("Marcador de rama no confiable")
                    folder = assets_root / candidate
                    if folder.is_symlink() or not folder.resolve().is_relative_to(assets_root):
                        raise ValueError("Carpeta de rama fuera del almacenamiento")
                    exists = db.execute(
                        "SELECT 1 FROM stories WHERE id=?", (candidate,)
                    ).fetchone() is not None
                    if not exists and folder.exists():
                        if not folder.is_dir():
                            raise ValueError("La ruta de rama incompleta no es un directorio")
                        shutil.rmtree(folder)
                        # The orphan's directory entry must also be flushed;
                        # otherwise a second crash may resurrect its filename.
                        self._fsync_directory(assets_root)
                    # Only a committed story may keep its media directory.
                    # Sync the marker deletion as well, on systems supporting
                    # directory fsync (POSIX). Mark recovery incomplete if it
                    # fails, rather than reporting successful cleanup.
                    marker.unlink()
                    self._fsync_directory(staging)
                    report["retained_stories" if exists else "removed_orphans"] += 1
                except (ValueError, OSError) as exc:
                    report["conflicts"] += 1
                    LOG.warning("No se limpió staging de rama %s: %s", candidate, exc)
        return report

    def fork_story(self, story_id: str, until_turn_id: str | None = None) -> dict:
        """Create all branch DB state atomically, with file-copy compensation.

        No branch becomes visible until the transaction commits. Every cloning
        service receives the same connection; failures roll back turns, scenes,
        plans, author assets, Lorebooks and world-state snapshots together.
        File copies are not SQLite-transactional, so any failure also removes
        the brand-new UUID-scoped branch directory. A power loss during a copy
        still requires on-startup cleanup of orphaned directories.
        """
        source = self.get_story(story_id)
        if source is None:
            raise ValueError("La historia original no existe")
        # Legacy art migration and creation of source's initial scene can
        # perform DB writes. Finish those BEFORE opening BEGIN IMMEDIATE to
        # avoid self-deadlock through VisualState's separate connections.
        if self.visual is not None:
            self.visual.all(story_id)

        new_id = str(uuid.uuid4())
        copied_dir = self.store.root / "story-assets" / new_id
        if copied_dir.exists() or copied_dir.is_symlink():
            raise ValueError("El directorio de la nueva rama ya existe")
        stage_root = self._fork_stage_root()
        marker = stage_root / (new_id + ".pending")
        try:
            with self.store._conn() as db:
                # NORMAL is not sufficient for WAL commit durability under an
                # unexpected power loss. FULL applies only to this connection.
                db.execute("PRAGMA synchronous=FULL")
                db.execute("BEGIN IMMEDIATE")
                stage_root.mkdir(parents=True, exist_ok=True)
                self._fsync_directory(stage_root.parent)
                # Create this before copying files: a crashed process leaves
                # a marker that the next startup can safely reconcile.
                with marker.open("x", encoding="utf-8") as stage_file:
                    stage_file.write(new_id)
                    stage_file.flush()
                    os.fsync(stage_file.fileno())
                # Make the marker's directory entry durable before any copies.
                self._fsync_directory(stage_root)
                # Re-read the source and turns under the same write lock.
                actual = db.execute(
                    "SELECT * FROM stories WHERE id=?", (story_id,)
                ).fetchone()
                if actual is None:
                    raise ValueError("La historia original ya no existe")
                existing = [dict(row) for row in db.execute(
                    "SELECT * FROM story_turns WHERE story_id=? "
                    "ORDER BY created_at,id", (story_id,)
                )]
                if until_turn_id:
                    positions = [index for index, turn in enumerate(existing)
                                 if turn["id"] == until_turn_id]
                    if not positions:
                        raise ValueError(
                            "La intervención seleccionada no pertenece a esta historia")
                    existing = existing[:positions[0] + 1]

                now = time.time()
                label = actual["title"][:88].rstrip() + " (rama)"
                db.execute("""INSERT INTO stories
                    (id,title,premise,created_at,updated_at,protagonist_name,
                     canon,origin_story_id,origin_turn_id)
                    VALUES (?,?,?,?,?,?,?,?,?)""",
                    (new_id, label, actual["premise"], now, now,
                     actual["protagonist_name"] or "Protagonista",
                     actual["canon"] or "", story_id, until_turn_id))
                turn_map = {}
                for idx, turn in enumerate(existing):
                    copied_turn_id = str(uuid.uuid4())
                    turn_map[turn["id"]] = copied_turn_id
                    db.execute("""INSERT INTO story_turns
                        (id,story_id,request_id,mode,input_text,assistant_text,model,created_at)
                        VALUES (?,?,?,?,?,?,?,?)""",
                        (copied_turn_id, new_id, str(uuid.uuid4()), turn["mode"],
                         turn["input_text"], turn["assistant_text"], turn["model"],
                         now + idx * 0.000001))

                visual_map = {}
                if self.visual is not None:
                    visual_map = self.visual.clone_branch(
                        story_id, new_id, turn_map, partial=bool(until_turn_id),
                        cutoff_created_at=existing[-1]["created_at"]
                        if existing and until_turn_id else None,
                        conn=db)
                else:
                    prior_art = self.store.root / "story-assets" / story_id / "scene.webp"
                    if prior_art.is_file() and not prior_art.is_symlink():
                        copied_dir.mkdir(parents=True)
                        shutil.copy2(prior_art, copied_dir / "scene.webp")
                character_ids = {}
                if self.creator is not None:
                    character_ids = self.creator.clone(
                        story_id, new_id, visual_map,
                        turn_map=turn_map, until_turn_id=until_turn_id, conn=db)
                if self.creator_media is not None:
                    self.creator_media.clone(
                        story_id, new_id, character_ids, turn_map=turn_map,
                        until_turn_id=until_turn_id, conn=db)
                if self.lorebook is not None:
                    self.lorebook.clone(
                        story_id, new_id, turn_map=turn_map,
                        until_turn_id=until_turn_id,
                        character_ids=character_ids, conn=db)
                if self.world is not None:
                    self.world.clone(
                        story_id, new_id, turn_map, until_turn_id, character_ids,
                        conn=db)
                # Flush the cloned bytes and directory entries BEFORE SQLite
                # commits. A failure here is handled by the existing rollback.
                self._sync_fork_files(copied_dir)
        except Exception:
            # The destination UUID is generated by this operation and was
            # checked absent above. Never remove the source story directory.
            cleaned = False
            try:
                if copied_dir.is_symlink():
                    copied_dir.unlink()
                elif copied_dir.is_dir():
                    shutil.rmtree(copied_dir)
                cleaned = True
            except OSError:
                LOG.exception("No se pudo limpiar el directorio de rama fallida %s", new_id)
            if cleaned:
                try:
                    marker.unlink(missing_ok=True)
                    if stage_root.is_dir():
                        self._fsync_directory(stage_root)
                except (OSError, ValueError):
                    LOG.exception("No se pudo limpiar marcador de rama %s", new_id)
            # If cleanup failed, leave the marker for startup reconciliation.
            raise
        try:
            marker.unlink(missing_ok=True)
            self._fsync_directory(stage_root)
        except (OSError, ValueError):
            # A committed story must remain usable. Next startup can remove
            # the stale marker without touching the committed directory.
            LOG.exception("La rama está confirmada pero falta limpiar marcador %s", new_id)
        return self.get_story(new_id)

    def set_canon(self, story_id: str, canon: str) -> dict:
        if len(canon) > 5000:
            raise ValueError("El canon no puede superar 5000 caracteres")
        with self.store._conn() as db:
            db.execute("UPDATE stories SET canon=?,updated_at=? WHERE id=?",
                       (canon.strip(), time.time(), story_id))
        return self.get_story(story_id)

    def turns(self, story_id: str, limit: int = 100) -> list[dict]:
        with self.store._conn() as db:
            return [dict(r) for r in db.execute(
                "SELECT * FROM (SELECT * FROM story_turns WHERE story_id=? "
                "ORDER BY created_at DESC, id DESC LIMIT ?) "
                "ORDER BY created_at ASC, id ASC", (story_id, limit))]

    def previous(self, story_id: str, request_id: str) -> dict | None:
        with self.store._conn() as db:
            r = db.execute(
                "SELECT * FROM story_turns WHERE story_id=? AND request_id=?",
                (story_id, request_id)).fetchone()
            return dict(r) if r else None

    def append(self, story_id: str, request_id: str, mode: str,
               instruction: str, response: str, model: str) -> dict:
        """Commit a complete narrative turn and its inferred scene atomically.

        A failed scene update must not leave a turn visible without its
        associated location. Existing idempotency keys never reapply a scene.
        """
        with self.store._conn() as db:
            old = db.execute(
                "SELECT * FROM story_turns WHERE story_id=? AND request_id=?",
                (story_id, request_id)).fetchone()
            if old:
                return dict(old)
            turn_id, now = str(uuid.uuid4()), time.time()
            db.execute("INSERT INTO story_turns VALUES (?,?,?,?,?,?,?,?)",
                       (turn_id, story_id, request_id, mode, instruction, response, model, now))
            db.execute("UPDATE stories SET updated_at=? WHERE id=?", (now, story_id))
            turn = dict(db.execute(
                "SELECT * FROM story_turns WHERE id=?", (turn_id,)
            ).fetchone())
            if self.visual is not None:
                transition = self.visual.observe_turn_in_transaction(db, story_id, turn)
                if transition is not None:
                    turn["scene_transition"] = transition
                self.visual.snapshot_turn_in_transaction(db, story_id, turn_id, now)
            if self.world is not None:
                self.world.snapshot_turn_in_transaction(db, story_id, turn_id, now)
            if self.lorebook is not None:
                self.lorebook.snapshot_turn_in_transaction(db, story_id, turn_id, now)
            if self.creator is not None:
                self.creator.snapshot_turn_in_transaction(db, story_id, turn_id, now)
            if self.creator_media is not None:
                self.creator_media.snapshot_turn_in_transaction(db, story_id, turn_id, now)
        return turn

    def messages(self, story: dict, instruction: str, mode: str) -> list[dict]:
        preferences = self.preferences()
        language = preferences.get("target_language", "es-419")
        styles = {"natural": "natural y conversacional", "literary": "literario y descriptivo",
                  "concise": "breve y dinámico"}
        output_preferences = ("Idioma de salida obligatorio: " + language +
                       ". Estilo narrativo: " + styles.get(preferences.get("narration_style"), "natural") + ".")
        if preferences.get("translation_mode") == "target_output":
            source = preferences.get("source_language", "auto")
            output_preferences += (" Idioma de entrada: " +
                            ("detecta automáticamente" if source == "auto" else source) +
                            ". Conserva el significado del contenido entrante y "
                            "escribe la respuesta únicamente en el idioma de salida.")
        canon = story.get("canon", "").strip()
        world_rules = "\nCanon persistente confirmado de la historia: " + canon if canon else ""
        recent_turns = self.turns(story["id"], limit=16)
        creator_context = self.creator.context(story) if self.creator is not None else ""
        # Only the current user intention and a bounded recent history activate
        # lore: author secrets do not trigger themselves by being in AI context.
        activation = "\n".join([
            instruction,
            *(turn["input_text"] + "\n" + turn["assistant_text"][:1600]
              for turn in recent_turns[-4:]),
        ])[-10000:]
        lorebook_context = (self.lorebook.activate(story["id"], activation)["context"]
                            if self.lorebook is not None else "")
        world_context = (self.world.context(story["id"]) if self.world is not None else "")
        messages = [{"role": "system", "content": PROMPT + "\n" + output_preferences +
                     "\nPremisa: " + story["premise"] + "\nProtagonista: " +
                     story.get("protagonist_name", "Protagonista") + world_rules +
                     ("\n\n" + creator_context if creator_context else "") +
                     ("\n\nLorebook activado para esta escena (conocimiento del mundo):\n" +
                      lorebook_context if lorebook_context else "") +
                     ("\n\n" + world_context if world_context else "")}]
        for t in recent_turns:
            messages.append({"role": "user", "content": t["mode"] + ": " + t["input_text"]})
            messages.append({"role": "assistant", "content": t["assistant_text"]})
        line = {"say": "El protagonista dice", "do": "El protagonista hace",
                "story": "El jugador dirige la historia", "continue": "Continúa la escena"
                }[mode]
        messages.append({"role": "user", "content": line + ": " + (instruction or "Prosigue desde aquí")})
        return messages

    async def generate(self, config: dict, messages: list[dict]):
        model = config["model"].strip()
        if not model:
            raise ValueError("Selecciona un modelo disponible en el proveedor antes de generar")
        remote = config["provider"] == "openrouter"
        worker = config["provider"] == "worker"
        if worker:
            if self.workers is None:
                raise ValueError("No existe un registro de workers")
            base, token = self.workers.endpoint(config["worker_id"])
        else:
            base = "https://openrouter.ai/api/v1" if remote else validate_endpoint(config["base_url"])
            token = self.secrets.read() if remote else ""
        if remote and not token:
            raise ValueError("Falta la clave de OpenRouter. Configúrala en Ajustes.")
        if config["provider"] == "ollama":
            path = "/api/chat"
            options = {"temperature": config["temperature"], "top_p": config["top_p"],
                       "num_ctx": config["num_ctx"], "num_predict": config["max_tokens"],
                       "top_k": config.get("top_k", 40),
                       "repeat_penalty": config.get("repetition_penalty", 1.0)}
            if config["device"] == "cpu":
                options["num_gpu"] = 0
            payload = {"model": model, "messages": messages, "stream": True,
                       "options": options, "keep_alive": "30m"}
            if config.get("reasoning_mode") == "off":
                payload["think"] = False
        else:
            path = "/chat/completions" if remote else "/v1/chat/completions"
            payload = {"model": model, "messages": messages, "stream": True,
                       "temperature": config["temperature"],
                       "top_p": config["top_p"], "max_tokens": config["max_tokens"]}
            if remote:
                payload["top_k"] = config.get("top_k", 40)
                payload["repetition_penalty"] = config.get("repetition_penalty", 1.0)
        timeout = httpx.Timeout(240, connect=5, read=240, write=20, pool=5)
        async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                                     timeout=timeout) as client:
            async with client.stream("POST", base + path, json=payload,
                                     headers={"Authorization": "Bearer " + token} if (remote or worker) else None,
                                     follow_redirects=False) as response:
                response.raise_for_status()
                # A clean EOF is not proof that generation finished. Cloudflare
                # may end a stream early without raising a network exception.
                finished = False
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    if config["provider"] != "ollama":
                        if not line.startswith("data:"):
                            continue
                        line = line.removeprefix("data:").strip()
                        if line == "[DONE]":
                            finished = True
                            break
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if config["provider"] == "ollama":
                        chunk = (data.get("message") or {}).get("content") or ""
                        if data.get("error"):
                            raise ValueError(str(data["error"])[:300])
                        if data.get("done") is True:
                            finished = True
                    else:
                        choices = data.get("choices") or []
                        delta = choices[0].get("delta") or {} if choices else {}
                        chunk = delta.get("content") or ""
                    if isinstance(chunk, str) and chunk:
                        yield chunk
                if not finished:
                    raise ValueError(
                        "El motor terminó la conexión sin confirmar el final de la generación")

    async def prepare(self) -> dict:
        """Explicit warm-up without adding content to any story.

        Loads a local/worker model through its normal inference contract. Never
        executed automatically at application startup or on page navigation.
        """
        config = self.config()
        if config["provider"] == "openrouter":
            raise ValueError("OpenRouter no ofrece precalentamiento persistente. Genera normalmente.")
        if not config["model"].strip():
            raise ValueError("Primero selecciona y guarda un modelo narrativo")
        warm = {**config, "max_tokens": 24, "temperature": 0.0}
        started = time.monotonic()
        first = None
        count = 0
        lease = False
        try:
            if (self.resources is not None and config["provider"] in {"ollama", "koboldcpp"}
                    and config["device"] != "cpu"):
                lease = await self.resources.claim_local_gpu("preparación del narrador")
            async for text in self.generate(warm, [
                {"role": "system", "content": "Responde brevemente en español."},
                {"role": "user", "content": "Responde únicamente: Listo."},
            ]):
                if first is None:
                    first = round((time.monotonic() - started) * 1000, 1)
                count += len(text)
        finally:
            if self.resources is not None:
                self.resources.release_local_gpu(lease)
        if count == 0:
            raise ValueError("El modelo no devolvió una respuesta de preparación")
        return {
            "ready": True,
            "provider": config["provider"], "model": config["model"],
            "duration_ms": round((time.monotonic() - started) * 1000, 1),
            "first_text_ms": first,
            "message": "Preparación completada; el motor puede descargar memoria si está inactivo.",
        }

    async def _generate_until_disconnect(self, config: dict, messages: list[dict],
                                         disconnected=None):
        """Poll a stalled upstream without waiting for another model token.

        Closing the downstream SSE stream cancels any pending upstream read,
        closes the httpx response and releases the caller's GPU lease.
        A new task is created only while awaiting the next upstream chunk.
        """
        async with aclosing(self.generate(config, messages)) as upstream:
            if disconnected is None:
                async for piece in upstream:
                    yield piece
                return
            while True:
                pending = asyncio.create_task(anext(upstream))
                try:
                    while not pending.done():
                        await asyncio.wait({pending}, timeout=0.2)
                        if not pending.done() and await disconnected():
                            return
                    try:
                        piece = pending.result()
                    except StopAsyncIteration:
                        return
                    # The caller checks the disconnect immediately before
                    # publishing the delta; avoid redundant probes per chunk.
                    yield piece
                finally:
                    if not pending.done():
                        pending.cancel()
                        await asyncio.gather(pending, return_exceptions=True)

    def register_generation(self, story_id: str, request_id: str) -> asyncio.Event:
        key = (story_id, request_id)
        if key in self._active_generations:
            raise HTTPException(409, "Esta solicitud narrativa ya está en curso")
        stopped = asyncio.Event()
        self._active_generations[key] = stopped
        return stopped

    def cancel_generation(self, story_id: str, request_id: str) -> dict:
        stopped = self._active_generations.get((story_id, request_id))
        if stopped is not None:
            stopped.set()
        return {"request_id": request_id, "cancel_requested": stopped is not None}

    def release_generation(self, story_id: str, request_id: str, stopped: asyncio.Event) -> None:
        key = (story_id, request_id)
        if self._active_generations.get(key) is stopped:
            del self._active_generations[key]

    async def stream_turn(self, story_id: str, request_id: str,
                          mode: str, instruction: str,
                          disconnected=None, stop_event: asyncio.Event | None = None):
        """Stop before committing a turn when the SSE client has gone away.

        StreamingResponse also cancels this generator on disconnect; explicit
        checks cover a disconnect observed between model chunks and commit.
        The upstream httpx stream closes in generate()'s async context.
        """
        async def stopped() -> bool:
            if stop_event is not None and stop_event.is_set():
                return True
            return disconnected is not None and await disconnected()

        should_stop = stopped if (stop_event is not None or disconnected is not None) else None
        lock = self.locks.setdefault(story_id, asyncio.Lock())
        async with lock:
            if should_stop is not None and await should_stop():
                return
            prior = self.previous(story_id, request_id)
            if prior:
                yield encode_event("done", {"turn": prior, "replayed": True})
                return
            story = self.get_story(story_id)
            if not story:
                yield encode_event("error", {"message": "Historia inexistente"})
                return
            config = self.config()
            collected: list[str] = []
            lease = False
            try:
                yield encode_event("status", {
                    "phase": "preparing", "message": "Preparando contexto de la historia..."})
                messages = self.messages(story, instruction, mode)
                yield encode_event("status", {
                    "phase": "connecting", "message": "Conectando con el modelo narrador..."})
                first_piece = True
                total_length = 0
                if (self.resources is not None and config["provider"] in {"ollama", "koboldcpp"}
                        and config["device"] != "cpu"):
                    lease = await self.resources.claim_local_gpu("narración local")
                async with aclosing(self._generate_until_disconnect(
                        config, messages, should_stop)) as generated:
                    async for piece in generated:
                        if should_stop is not None and await should_stop():
                            return
                        if first_piece:
                            yield encode_event("status", {
                                "phase": "streaming", "message": "Narración en curso..."})
                            first_piece = False
                        collected.append(piece)
                        total_length += len(piece)
                        if total_length > 40000:
                            raise ValueError("La salida excedió el límite de longitud")
                        yield encode_event("delta", {"text": piece})
                text = "".join(collected).strip()
                if not text:
                    raise ValueError("El modelo no produjo narración")
                if should_stop is not None and await should_stop():
                    return
                turn = self.append(story_id, request_id, mode, instruction, text, config["model"])
                yield encode_event("done", {"turn": turn, "replayed": False})
            except HTTPException as exc:
                yield encode_event("error", {"message": str(exc.detail)[:400]})
            except (httpx.HTTPError, ValueError, OSError, sqlite3.Error) as exc:
                # Never commit an incomplete story turn.
                yield encode_event("error", {"message": str(exc)[:400]})
            finally:
                if self.resources is not None:
                    self.resources.release_local_gpu(lease)


def mount_narrative_routes(app, narrative: NarrativeService):
    @app.get("/api/v1/narrative/config")
    def get_config():
        return narrative.config()

    @app.put("/api/v1/narrative/config")
    def set_config(body: LlmSettings):
        try:
            return narrative.configure(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/narrative/prepare")
    async def warmup():
        try:
            return await narrative.prepare()
        except (httpx.HTTPError, ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)[:250]) from exc

    @app.get("/api/v1/narrative/models")
    async def get_models():
        return await narrative.available_models()

    @app.get("/api/v1/stories")
    def get_stories():
        return {"stories": narrative.stories()}

    @app.post("/api/v1/stories", status_code=201)
    def new_story(body: CreateStory):
        return narrative.create_story(body.title, body.premise, body.protagonist_name)

    @app.get("/api/v1/stories/{story_id}")
    def get_story(story_id: uuid.UUID):
        story = narrative.get_story(str(story_id))
        if not story:
            raise HTTPException(404, "Historia inexistente")
        return story

    @app.post("/api/v1/stories/{story_id}/fork", status_code=201)
    def fork_story(story_id: uuid.UUID, body: ForkRequest):
        try:
            return narrative.fork_story(str(story_id),
                                        str(body.until_turn_id) if body.until_turn_id else None)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.patch("/api/v1/stories/{story_id}/canon")
    def set_canon(story_id: uuid.UUID, body: CanonChange):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        return narrative.set_canon(str(story_id), body.canon)

    @app.get("/api/v1/stories/{story_id}/turns")
    def get_turns(story_id: uuid.UUID):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        return {"turns": narrative.turns(str(story_id))}

    @app.post("/api/v1/stories/{story_id}/generate")
    async def stream_story(story_id: uuid.UUID, body: TurnRequest, request: Request):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        if body.mode not in {"say", "do", "story", "continue"}:
            raise HTTPException(422, "Modo de interacción inválido")
        if body.mode != "continue" and not body.input_text.strip():
            raise HTTPException(422, "Debes escribir una acción, diálogo o indicación")
        sid, rid = str(story_id), str(body.request_id)
        stopped = narrative.register_generation(sid, rid)

        async def events():
            try:
                async for packet in narrative.stream_turn(
                    sid, rid, body.mode, body.input_text.strip(),
                    disconnected=request.is_disconnected, stop_event=stopped
                ):
                    yield packet
            finally:
                narrative.release_generation(sid, rid, stopped)

        return StreamingResponse(
            events(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/v1/stories/{story_id}/generate/{request_id}/cancel")
    async def cancel_story_generation(story_id: uuid.UUID, request_id: uuid.UUID):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        # Signalling is best-effort; an already committed turn is not undone.
        return narrative.cancel_generation(str(story_id), str(request_id))
