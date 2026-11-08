"""Minimal managed KoboldCpp launcher for downloaded, registered GGUF models.

Only starts an explicitly selected KoboldCpp executable, no shell, no arbitrary
scripts, and always binds 127.0.0.1. Does not download executables automatically.
"""
from __future__ import annotations

import os
import socket
import subprocess
import threading
from pathlib import Path

import httpx

from .store import Store


class RuntimeFailure(ValueError):
    pass


class KoboldManager:
    def __init__(self, store: Store):
        self.store = store
        self.proc: subprocess.Popen | None = None
        self._lock = threading.RLock()
        self.log_stream = None
        self.port = 5001
        self.model_filename = ""
        self.gpu_layers = -1

    @staticmethod
    def _port_available(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(.3)
            return sock.connect_ex(("127.0.0.1", port)) != 0

    def _owned(self):
        return self.proc is not None and self.proc.poll() is None

    def status(self) -> dict:
        with self._lock:
            if self.proc is None:
                return {"status": "stopped", "owns_process": False}
            code = self.proc.poll()
            result = {
                "status": "exited" if code is not None else "starting",
                "owns_process": True, "pid": self.proc.pid,
                "exit_code": code, "port": self.port,
                "model_filename": self.model_filename,
                "gpu_layers": self.gpu_layers,
                "base_url": "http://127.0.0.1:" + str(self.port),
            }
            if code is None:
                try:
                    with httpx.Client(trust_env=False, timeout=1) as client:
                        res = client.get(result["base_url"] + "/v1/models", follow_redirects=False)
                        if res.status_code == 200:
                            result["status"] = "ready"
                except httpx.HTTPError:
                    pass
            return result

    def start(self, executable: str, installed_id: str,
              gpu_layers: int = -1, contextsize: int = 4096, port: int = 5001):
        with self._lock:
            if self._owned():
                raise RuntimeFailure("Noble AI is already running KoboldCpp. Stop it before switching models.")
            exe = Path(executable).expanduser().resolve(strict=False)
            allowed = (
                exe.name.lower().startswith("koboldcpp")
                and (exe.suffix.lower() == ".exe" or exe.name.lower() == "koboldcpp-linux-x64")
            )
            if not allowed or not exe.is_file():
                raise RuntimeFailure("Select a valid KoboldCpp executable (.exe or koboldcpp-linux-x64)")
            if not (-1 <= gpu_layers <= 256):
                raise RuntimeFailure("GPU layers must be between -1 and 256")
            if not (512 <= contextsize <= 32768):
                raise RuntimeFailure("Context size must be between 512 and 32768")
            if not (1024 <= port <= 65535) or port in (4173, 5173, 8000):
                raise RuntimeFailure("Invalid port or one reserved for Noble AI")
            model = self.store.installed_one(installed_id)
            if model is None:
                raise RuntimeFailure("Select a model registered by Noble AI")
            filepath = Path(model["filepath"]).resolve(strict=False)
            if not filepath.is_relative_to(self.store.models_dir.resolve()):
                raise RuntimeFailure("Model is outside the managed library")
            if not filepath.is_file() or filepath.suffix.lower() != ".gguf":
                raise RuntimeFailure("GGUF file no longer exists in the library")
            if filepath.stat().st_size != model["size_bytes"]:
                raise RuntimeFailure("Model size differs from the registered value")
            # Avoid hijacking an existing local server. Still subject to a normal
            # TOCTOU race, handled by process exit and status diagnostics.
            if not self._port_available(port):
                raise RuntimeFailure("Port is already in use. Choose another.")
            command = [
                str(exe), "--model", str(filepath),
                "--host", "127.0.0.1",
                "--port", str(port),
                "--gpulayers", str(gpu_layers),
                "--contextsize", str(contextsize),
            ]
            logs_dir = self.store.root / "logs"
            logs_dir.mkdir(exist_ok=True)
            self.log_stream = (logs_dir / "koboldcpp.log").open("ab", buffering=0)
            try:
                self.proc = subprocess.Popen(
                    command, shell=False, cwd=str(exe.parent),
                    stdin=subprocess.DEVNULL, stdout=self.log_stream,
                    stderr=subprocess.STDOUT,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except (OSError, ValueError) as exc:
                self.log_stream.close()
                self.log_stream = None
                raise RuntimeFailure("Could not start KoboldCpp: " + str(exc)) from exc
            self.port = port
            self.model_filename = filepath.name
            self.gpu_layers = gpu_layers
            return self.status()

    def installed_models(self):
        return [{"id": m["id"], "filename": m["filename"], "size_bytes": m["size_bytes"]}
                for m in self.store.installed() if m["filepath"].lower().endswith(".gguf")
                and Path(m["filepath"]).is_file()]

    def activate_model(self) -> dict:
        state = self.status()
        if state["status"] != "ready":
            raise RuntimeFailure("Model is not ready yet")
        url = state["base_url"] + "/v1/models"
        try:
            with httpx.Client(trust_env=False, timeout=3) as client:
                response = client.get(url)
                response.raise_for_status()
                available = response.json().get("data") or []
                model_id = next((v.get("id") for v in available if isinstance(v, dict)
                                 and isinstance(v.get("id"), str)), None)
                if not model_id:
                    raise RuntimeFailure("KoboldCpp does not report an active model")
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeFailure("Could not read the model loaded in KoboldCpp") from exc
        return {"provider": "koboldcpp", "base_url": state["base_url"],
                "model": model_id, "device": "auto"}

    def stop(self):
        with self._lock:
            if self.proc is not None:
                if self.proc.poll() is None:
                    self.proc.terminate()
                    try:
                        self.proc.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        self.proc.kill()
                        self.proc.wait(timeout=5)
                self.proc = None
            if self.log_stream is not None:
                self.log_stream.close()
                self.log_stream = None
            return {"status": "stopped", "owns_process": False}
