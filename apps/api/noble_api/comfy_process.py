"""Explicit locally managed ComfyUI Python launcher.

Noble only starts an existing installation selected by the user, on loopback,
with a fixed argv. It does not execute installer scripts, clone repositories,
or adopt/terminate ComfyUI processes that Noble did not launch.
"""
from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import threading
from pathlib import Path
from typing import Literal

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .images import ImageSettings, SceneImageService
from .checkpoint_installer import CheckpointInstaller
from .store import Store

RESERVED_PORTS = {4173, 5001, 5173, 8000}
PYTHON_NAME = re.compile(r"python(?:3(?:\.\d{1,2})?)?(?:\.exe)?$", re.I)
REQUIRED_COMFY_FILES = ("main.py", "server.py", "folder_paths.py", "comfy/cli_args.py")


class ComfyLaunchConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    install_dir: str = Field(default="", max_length=1024)
    python_executable: str = Field(default="", max_length=1024)
    port: int = Field(default=8188, ge=1024, le=65535)
    memory_mode: Literal["auto", "lowvram", "normalvram", "highvram", "cpu"] = "auto"


class ComfyProcessManager:
    def __init__(self, store: Store, images: SceneImageService,
                 checkpoints: CheckpointInstaller):
        self.store = store
        self.images = images
        self.checkpoints = checkpoints
        self.proc: subprocess.Popen | None = None
        self.log_stream = None
        self.lock = threading.RLock()
        self.launched_config: ComfyLaunchConfig | None = None
        with self.store._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS comfy_runtime_preferences(
                id INTEGER PRIMARY KEY CHECK(id=1),
                config_json TEXT NOT NULL
            )""")
            db.execute("INSERT OR IGNORE INTO comfy_runtime_preferences VALUES (1,?)",
                       (ComfyLaunchConfig().model_dump_json(),))

    def config(self) -> dict:
        with self.store._conn() as db:
            row = db.execute(
                "SELECT config_json FROM comfy_runtime_preferences WHERE id=1"
            ).fetchone()
        return ComfyLaunchConfig.model_validate_json(row["config_json"]).model_dump()

    def configure(self, config: ComfyLaunchConfig) -> dict:
        with self.lock:
            if self._running():
                raise HTTPException(409, "Stop ComfyUI before changing its launch settings")
            self.validate(config)
            with self.store._conn() as db:
                db.execute("UPDATE comfy_runtime_preferences SET config_json=? WHERE id=1",
                           (config.model_dump_json(),))
            return self.config()

    @staticmethod
    def _port_unused(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as stream:
            stream.settimeout(.3)
            return stream.connect_ex(("127.0.0.1", port)) != 0

    @staticmethod
    def _directory(config: ComfyLaunchConfig) -> Path:
        if not config.install_dir:
            raise HTTPException(422, "Specify the folder containing ComfyUI/main.py")
        original = Path(config.install_dir).expanduser()
        if not original.is_absolute() or original.is_symlink():
            raise HTTPException(422, "ComfyUI folder must be an absolute, non-symlink path")
        directory = original.resolve(strict=False)
        if not directory.is_dir() or not all(
                (directory / file).is_file() and not (directory / file).is_symlink()
                for file in REQUIRED_COMFY_FILES):
            raise HTTPException(422, "This does not look like a complete ComfyUI installation")
        return directory

    @staticmethod
    def _python(config: ComfyLaunchConfig, directory: Path) -> Path:
        explicit = config.python_executable.strip()
        if explicit:
            candidate = Path(explicit).expanduser()
            if not candidate.is_absolute() or not PYTHON_NAME.fullmatch(candidate.name):
                raise HTTPException(422, "Select an absolute path to a valid Python executable")
            candidates = [candidate]
        else:
            candidates = [
                directory.parent / "python_embeded" / "python.exe",
                directory / ".venv" / "Scripts" / "python.exe",
                directory / "venv" / "Scripts" / "python.exe",
                directory / ".venv" / "bin" / "python",
                directory / "venv" / "bin" / "python",
                Path(sys.executable),
            ]
        for candidate in candidates:
            if candidate.is_file() and PYTHON_NAME.fullmatch(candidate.name):
                path = candidate.resolve(strict=False)
                if path.is_file() and (os.name == "nt" or os.access(path, os.X_OK)):
                    return path
        raise HTTPException(422, "No Python executable found for ComfyUI")

    def validate(self, config: ComfyLaunchConfig) -> dict:
        if config.port in RESERVED_PORTS:
            raise HTTPException(422, "Port reserved for another Noble AI service")
        directory = self._directory(config)
        executable = self._python(config, directory)
        bridge = self.checkpoints.path_config()
        url = f"http://127.0.0.1:{config.port}"
        return {
            "valid": True,
            "install_dir": str(directory),
            "python_executable": str(executable),
            "model_paths_config": bridge["config_path"],
            "base_url": url,
            "memory_mode": config.memory_mode,
        }

    def _running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    @staticmethod
    def _probe(url: str) -> dict | None:
        try:
            with httpx.Client(timeout=1.0, trust_env=False) as client:
                response = client.get(url + "/system_stats", follow_redirects=False)
                response.raise_for_status()
                value = response.json()
            if not isinstance(value, dict) or not isinstance(value.get("system"), dict):
                return None
            # Do not expose ComfyUI sys.argv: it may contain private local paths.
            info = value["system"]
            devices = value.get("devices")
            if not isinstance(devices, list):
                devices = []
            return {
                "comfyui_version": str(info.get("comfyui_version") or "")[:64],
                "python_version": str(info.get("python_version") or "")[:90],
                "devices": [
                    {"name": str(device.get("name") or "")[:120],
                     "type": str(device.get("type") or "")[:40]}
                    for device in devices[:8]
                    if isinstance(device, dict)
                ],
            }
        except (httpx.HTTPError, ValueError, TypeError):
            return None

    def status(self) -> dict:
        with self.lock:
            config = self.launched_config or ComfyLaunchConfig.model_validate(self.config())
            url = f"http://127.0.0.1:{config.port}"
            if self.proc is None:
                return {"status": "stopped", "owns_process": False, "base_url": url,
                        "pid": None, "exit_code": None, "diagnostics": None}
            code = self.proc.poll()
            diagnostics = self._probe(url) if code is None else None
            return {
                "status": ("exited" if code is not None else
                           "ready" if diagnostics is not None else "starting"),
                "owns_process": True,
                "pid": self.proc.pid,
                "exit_code": code,
                "base_url": url,
                "diagnostics": diagnostics,
            }

    def start(self) -> dict:
        with self.lock:
            if self._running():
                raise HTTPException(409, "ComfyUI was already launched by Noble AI")
            config = ComfyLaunchConfig.model_validate(self.config())
            values = self.validate(config)
            if not self._port_unused(config.port):
                raise HTTPException(409, "Port is already in use; an external process will not be controlled")
            argv = [
                values["python_executable"], str(Path(values["install_dir"]) / "main.py"),
                "--listen", "127.0.0.1", "--port", str(config.port),
                "--disable-auto-launch", "--extra-model-paths-config",
                values["model_paths_config"],
            ]
            if config.memory_mode != "auto":
                argv.append("--" + config.memory_mode)
            logs = self.store.root / "logs"
            if logs.is_symlink():
                raise HTTPException(409, "Untrusted log path")
            logs.mkdir(exist_ok=True)
            logfile = logs / "comfyui.log"
            if logfile.is_symlink():
                raise HTTPException(409, "Symlinked log files will not be written to")
            if self.proc is not None:
                # The previous process exited naturally; release its log handle
                # before starting the next one.
                self.proc = None
                if self.log_stream is not None:
                    self.log_stream.close()
                    self.log_stream = None
                self.launched_config = None
            self.log_stream = logfile.open("ab", buffering=0)
            try:
                self.proc = subprocess.Popen(
                    argv, shell=False, cwd=values["install_dir"],
                    stdin=subprocess.DEVNULL, stdout=self.log_stream,
                    stderr=subprocess.STDOUT,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                self.launched_config = config
                current = self.images.config()
                self.images.configure(ImageSettings.model_validate({
                    **current, "base_url": values["base_url"]
                }))
            except Exception as exc:
                if self.proc is not None:
                    self._stop_process()
                if self.log_stream is not None:
                    self.log_stream.close()
                    self.log_stream = None
                self.launched_config = None
                if isinstance(exc, HTTPException):
                    raise
                raise HTTPException(502, "Could not start ComfyUI: " + str(exc)[:200]) from exc
            return self.status()

    def _stop_process(self):
        if self._running():
            self.proc.terminate()
            try:
                self.proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
        self.proc = None

    def stop(self) -> dict:
        with self.lock:
            if self.proc is None:
                raise HTTPException(409, "Noble AI is not managing a running ComfyUI process")
            self._stop_process()
            if self.log_stream is not None:
                self.log_stream.close()
                self.log_stream = None
            self.launched_config = None
            return self.status()

    def logs(self) -> dict:
        path = self.store.root / "logs" / "comfyui.log"
        if not path.is_file() or path.is_symlink():
            return {"text": "", "truncated": False}
        size = path.stat().st_size
        with path.open("rb") as handle:
            if size > 16_384:
                handle.seek(size - 16_384)
            raw = handle.read(16_384)
        return {"text": raw.decode("utf-8", errors="replace"),
                "truncated": size > 16_384}

    def shutdown(self):
        with self.lock:
            if self.proc is not None:
                self._stop_process()
            if self.log_stream is not None:
                self.log_stream.close()
                self.log_stream = None


def mount_comfy_process_routes(app, runtime: ComfyProcessManager):
    def guard_local_action(request: Request):
        # Cross-origin HTML forms can POST with no preflight. Never let an
        # unrelated website start or kill a locally configured runtime.
        origin = request.headers.get("origin")
        allowed = {
            str(request.base_url).rstrip("/"),
            "http://127.0.0.1:5173", "http://localhost:5173",
            "http://127.0.0.1:4173", "http://localhost:4173",
        }
        if (origin and origin not in allowed) or request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "ComfyUI management requests must originate from Noble AI")

    @app.get("/api/v1/images/runtime/config")
    def config():
        return runtime.config()

    @app.put("/api/v1/images/runtime/config")
    def configure(body: ComfyLaunchConfig):
        return runtime.configure(body)

    @app.post("/api/v1/images/runtime/validate")
    def validate(body: ComfyLaunchConfig):
        return runtime.validate(body)

    @app.get("/api/v1/images/runtime/status")
    def status():
        return runtime.status()

    @app.post("/api/v1/images/runtime/start")
    def start(request: Request):
        guard_local_action(request)
        return runtime.start()

    @app.post("/api/v1/images/runtime/stop")
    def stop(request: Request):
        guard_local_action(request)
        return runtime.stop()

    @app.get("/api/v1/images/runtime/logs")
    def logs():
        return runtime.logs()
