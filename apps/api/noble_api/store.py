"""Durable SQLite store for settings, install jobs and model assignments."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path

DEFAULT_SETTINGS = {
    "setup_complete": False, "language": "es-419",
    "image_mode": "scene", "tts_enabled": False, "tts_autoread": False,
}
ROLE_NAMES = {"narrator", "world_state", "scene_image", "character_image", "speech"}


class Store:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.models_dir = self.root / "models"
        self.models_dir.mkdir(exist_ok=True)
        self.db = self.root / "noble.sqlite"
        self._init_db()

    def _conn(self):
        conn = sqlite3.connect(self.db, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=15000")
        return conn

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS settings (
                    name TEXT PRIMARY KEY, value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS downloads (
                    id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, revision TEXT NOT NULL,
                    filename TEXT NOT NULL, expected_size INTEGER, expected_sha256 TEXT,
                    received_bytes INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL, error TEXT,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS installed (
                    id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, revision TEXT NOT NULL,
                    filename TEXT NOT NULL, size_bytes INTEGER NOT NULL,
                    sha256 TEXT NOT NULL, integrity_status TEXT NOT NULL,
                    filepath TEXT NOT NULL, created_at REAL NOT NULL,
                    UNIQUE(repo_id, revision, filename)
                );
                CREATE TABLE IF NOT EXISTS model_roles (
                    role TEXT PRIMARY KEY, installed_id TEXT NOT NULL
                );
            """)
            conn.execute("UPDATE downloads SET status='paused', error='Interrumpida al cerrar la aplicación' WHERE status IN ('queued','downloading','verifying')")
            for key, value in DEFAULT_SETTINGS.items():
                conn.execute("INSERT OR IGNORE INTO settings VALUES (?,?)", (key, json.dumps(value)))

    @staticmethod
    def _dict(row):
        return dict(row) if row is not None else None

    def settings(self):
        with self._conn() as conn:
            return {r["name"]: json.loads(r["value"])
                    for r in conn.execute("SELECT name,value FROM settings")}

    def patch_settings(self, changes: dict):
        with self._conn() as conn:
            for name, value in changes.items():
                if name not in DEFAULT_SETTINGS:
                    raise ValueError("Configuración desconocida: " + name)
                if name in ("tts_enabled", "tts_autoread", "setup_complete") and not isinstance(value, bool):
                    raise ValueError(name + " debe ser booleano")
                if name == "language" and value not in ("es-419", "en"):
                    raise ValueError("Idioma no disponible")
                if name == "image_mode" and value not in ("scene", "manual", "off"):
                    raise ValueError("Modo de imagen no disponible")
                conn.execute("UPDATE settings SET value=? WHERE name=?",
                             (json.dumps(value), name))
        return self.settings()

    def downloads(self):
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM downloads ORDER BY created_at DESC LIMIT 200")]

    def download(self, job_id: str):
        with self._conn() as conn:
            return self._dict(conn.execute("SELECT * FROM downloads WHERE id=?", (job_id,)).fetchone())

    def enqueue(self, repo_id, revision, filename, size, sha):
        with self._conn() as conn:
            prev = conn.execute(
                "SELECT * FROM downloads WHERE repo_id=? AND revision=? AND filename=? "
                "AND status IN ('queued','downloading','verifying','completed') "
                "ORDER BY created_at DESC LIMIT 1", (repo_id, revision, filename)).fetchone()
            if prev:
                return dict(prev), False
            job_id = str(uuid.uuid4())
            now = time.time()
            conn.execute(
                "INSERT INTO downloads (id,repo_id,revision,filename,expected_size,"
                "expected_sha256,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (job_id, repo_id, revision, filename, size, sha, "queued", now, now),
            )
        return self.download(job_id), True

    def update_download(self, job_id, **fields):
        allowed = {"status", "received_bytes", "error"}
        if not set(fields).issubset(allowed):
            raise ValueError("Campos de descarga inválidos")
        fields["updated_at"] = time.time()
        sql = ", ".join(key + "=?" for key in fields)
        with self._conn() as conn:
            conn.execute("UPDATE downloads SET " + sql + " WHERE id=?",
                         [*fields.values(), job_id])

    def installed(self):
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM installed ORDER BY created_at DESC")]

    def installed_one(self, installed_id):
        with self._conn() as conn:
            return self._dict(conn.execute(
                "SELECT * FROM installed WHERE id=?", (installed_id,)).fetchone())

    def register_model(self, job, path, digest, integrity):
        model_id = str(uuid.uuid4())
        with self._conn() as conn:
            previous = conn.execute(
                "SELECT id FROM installed WHERE repo_id=? AND revision=? AND filename=?",
                (job["repo_id"], job["revision"], job["filename"])).fetchone()
            if previous:
                return previous["id"]
            conn.execute(
                "INSERT INTO installed VALUES (?,?,?,?,?,?,?,?,?,?)",
                (model_id, job["repo_id"], job["revision"], job["filename"],
                 path.stat().st_size, digest, integrity, str(path), time.time()),
            )
        return model_id

    def roles(self):
        with self._conn() as conn:
            return {r["role"]: r["installed_id"] for r in
                    conn.execute("SELECT * FROM model_roles")}

    def assign(self, role, installed_id):
        if role not in ROLE_NAMES:
            raise ValueError("Rol desconocido")
        with self._conn() as conn:
            model = conn.execute("SELECT * FROM installed WHERE id=?",
                                 (installed_id,)).fetchone()
            if model is None:
                raise ValueError("El modelo no está instalado")
            if not Path(model["filepath"]).is_file():
                raise ValueError("El archivo del modelo ya no existe")
            if role not in ("narrator", "world_state"):
                raise ValueError("La asignación de imágenes y voces llegará con sus adaptadores")
            conn.execute("INSERT INTO model_roles VALUES (?,?) "
                         "ON CONFLICT(role) DO UPDATE SET installed_id=excluded.installed_id",
                         (role, installed_id))
        return self.roles()
