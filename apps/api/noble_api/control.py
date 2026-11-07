"""App preferences, local diagnostics and release discovery (no auto-install).

Settings are validated and stored in SQLite. A source checkout does not claim to
have a stable/beta/nightly binary build installed. Release checks never execute files.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import threading
import time
from importlib import metadata
from pathlib import Path

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .store import Store


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_language: str = "es-419"
    source_language: str = "auto"
    narration_style: str = "natural"
    translation_mode: str = "off"
    accent: str = "violet"
    font_scale: int = Field(default=100, ge=85, le=135)
    reader_layout: str = "immersive"
    shortcuts_enabled: bool = True
    update_channel: str = "stable"
    check_updates_on_start: bool = True

    def validate_choices(self):
        allowed = {
            "target_language": {"es-419", "en", "ja", "ko", "pt-BR", "fr"},
            "source_language": {"auto", "es", "en", "ja", "ko", "pt", "fr"},
            "narration_style": {"natural", "literary", "concise"},
            "translation_mode": {"off", "target_output"},
            "accent": {"violet", "rose", "teal"},
            "reader_layout": {"immersive", "classic", "chat"},
            "update_channel": {"stable", "beta", "nightly"},
        }
        for name, options in allowed.items():
            if getattr(self, name) not in options:
                raise ValueError("Unsupported value for " + name)
        return self


class ControlPlane:
    def __init__(self, store: Store, transport: httpx.BaseTransport | None = None):
        self.store = store
        self.transport = transport
        self._cache: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()
        with self.store._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS workspace_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)""")
            db.execute("INSERT OR IGNORE INTO workspace_preferences VALUES (1, ?)",
                       (Preferences().model_dump_json(),))

    def preferences(self) -> dict:
        with self.store._conn() as db:
            data = json.loads(db.execute(
                "SELECT data FROM workspace_preferences WHERE id = 1").fetchone()[0])
        return Preferences.model_validate(data).model_dump()

    def patch_preferences(self, changes: dict) -> dict:
        # Read and update while holding one SQLite write transaction.
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            data = json.loads(db.execute(
                "SELECT data FROM workspace_preferences WHERE id=1").fetchone()[0])
            data.update(changes)
            validated = Preferences.model_validate(data).validate_choices()
            db.execute("UPDATE workspace_preferences SET data=? WHERE id=1",
                       (validated.model_dump_json(),))
        return validated.model_dump()

    def about(self) -> dict:
        repo_root = Path(__file__).resolve().parents[3]
        commit = os.getenv("NOBLE_BUILD_COMMIT", "").strip()
        if not commit:
            try:
                proc = subprocess.run(
                    ["git", "-C", str(repo_root), "rev-parse", "--short=12", "HEAD"],
                    capture_output=True, text=True, timeout=2, check=True)
                commit = proc.stdout.strip()
            except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
                commit = "unknown"
        return {
            "name": "Noble AI", "version": "0.2.0-dev",
            "commit": commit, "build_type": "source",
            "channel": self.preferences()["update_channel"],
            "models_dir": str(self.store.models_dir),
            "data_dir": str(self.store.root),
            "python": platform.python_version(),
            "os": platform.system(),
            "auto_update_supported": False,
        }

    def runtimes(self) -> dict:
        packages = ["fastapi", "uvicorn", "httpx", "psutil", "pydantic",
                    "keyring", "torch", "transformers", "diffusers",
                    "llama-cpp-python", "comfyui"]
        versions = {}
        for name in packages:
            try:
                versions[name] = metadata.version(name)
            except metadata.PackageNotFoundError:
                versions[name] = None
        binaries = {name: shutil.which(name) for name in
                    ("git", "node", "npm", "ollama", "llama-server",
                     "sd-server", "bun", "cloudflared")}
        return {"python_packages": versions, "binaries": binaries,
                "updatable_from_app": False, "scope": "read_only_diagnostics"}

    def releases(self, force: bool = False) -> dict:
        channel = self.preferences()["update_channel"]
        with self._lock:
            previous = self._cache.get(channel)
            if not force and previous and time.monotonic() - previous[0] < 900:
                return previous[1]
        try:
            with httpx.Client(transport=self.transport, trust_env=False, timeout=10,
                              headers={"User-Agent": "NobleAI/0.2"}) as client:
                response = client.get(
                    "https://api.github.com/repos/Mairon31/novel_ai/releases",
                    params={"per_page": 60}, follow_redirects=False)
                response.raise_for_status()
                source = response.json()
            if not isinstance(source, list):
                raise ValueError("Release response is not a list")
            selected = []
            for release in source:
                if not isinstance(release, dict) or release.get("draft"):
                    continue
                tag = str(release.get("tag_name") or "")
                night = "nightly" in tag.lower()
                beta = "beta" in tag.lower() or ("rc" in tag.lower()) or bool(release.get("prerelease"))
                category = "nightly" if night else "beta" if beta else "stable"
                if category != channel:
                    continue
                selected.append({
                    "version": tag, "name": release.get("name") or tag,
                    "published_at": release.get("published_at"),
                    "url": release.get("html_url"),
                    "assets": len(release.get("assets") or []),
                    "channel": category,
                })
            result = {
                "channel": channel, "release": selected[0] if selected else None,
                # Can't compare source checkout against a packaged release semver.
                "update_available": False, "check_success": True,
                "needs_installer": True,
                "message": "Source installations cannot be updated automatically.",
            }
        except (httpx.HTTPError, ValueError) as exc:
            result = {"channel": channel, "release": None, "update_available": False,
                      "check_success": False, "needs_installer": True,
                      "message": "Could not query GitHub: " + str(exc)[:160]}
        with self._lock:
            self._cache[channel] = (time.monotonic(), result)
        return result


def mount_control_routes(app, control: ControlPlane):
    @app.get("/api/v1/workspace/preferences")
    def preferences():
        return control.preferences()

    @app.patch("/api/v1/workspace/preferences")
    def patch_preferences(changes: dict):
        try:
            return control.patch_preferences(changes)
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/about")
    def about():
        return control.about()

    @app.get("/api/v1/runtime/diagnostics")
    def packages():
        return control.runtimes()

    @app.get("/api/v1/updates")
    def updates(force: bool = False):
        return control.releases(force=force)

    @app.get("/api/v1/network/capabilities")
    def network():
        return {
            "mode": "loopback_only", "shared_workspace": False,
            "cloudflare_tunnel": "external_worker_connection_only",
            "remote_workers": "openai_compatible_llm_tunnels",
            "api_key_auth": "not_implemented",
            "cors_management": "not_implemented",
            "message": "The Noble AI server remains bound to loopback. You can register an external HTTPS worker, but sharing the workspace over LAN or a tunnel requires separate authentication.",
        }
