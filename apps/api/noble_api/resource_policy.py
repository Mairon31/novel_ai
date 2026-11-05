"""Conservative GPU resource admission based on observed nvidia-smi VRAM.

No arbitrary GPU benchmarks, no inferred model footprints, no background
monitoring, and no automatic killing/unloading of external user processes.
Policy 'guard' acts only on an explicit ComfyUI request; 'monitor' is default.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import time

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .store import Store


class ResourceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: str = "monitor"
    gpu_index: int = Field(default=0, ge=0, le=31)
    minimum_free_mib: int = Field(default=3072, ge=0, le=65536)
    serialize_local_gpu: bool = True


def gpu_snapshot() -> list[dict]:
    """Read GPU-global *observed* free memory; not a model footprint estimate."""
    try:
        result = subprocess.run([
            "nvidia-smi",
            "--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu",
            "--format=csv,noheader,nounits",
        ], capture_output=True, text=True, check=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        return []
    devices = []
    for line in result.stdout.splitlines():
        values = [item.strip() for item in line.split(",")]
        if len(values) != 6:
            continue
        try:
            idx = int(values[0])
            total = int(values[2]); used = int(values[3]); free = int(values[4])
            load = int(values[5]) if values[5].isdigit() else None
        except ValueError:
            continue
        if total <= 0 or min(used, free) < 0:
            continue
        devices.append({
            "index": idx, "name": values[1], "total_mib": total,
            "used_mib": used, "free_mib": free, "gpu_utilization_percent": load,
        })
    return devices


class ResourceController:
    def __init__(self, store: Store):
        self.store = store
        self._gpu_lock = asyncio.Lock()
        self._active: dict | None = None
        with store._conn() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS resource_preferences(
                id INTEGER PRIMARY KEY CHECK(id=1), config_json TEXT NOT NULL
            )""")
            conn.execute("INSERT OR IGNORE INTO resource_preferences VALUES (1,?)",
                         (ResourceConfig().model_dump_json(),))

    def config(self) -> dict:
        with self.store._conn() as conn:
            row = conn.execute("SELECT config_json FROM resource_preferences WHERE id=1").fetchone()
        return ResourceConfig.model_validate_json(row["config_json"]).model_dump()

    def configure(self, config: ResourceConfig) -> dict:
        if config.mode not in {"monitor", "guard"}:
            raise ValueError("Modo de gestión GPU no disponible")
        with self.store._conn() as conn:
            conn.execute("UPDATE resource_preferences SET config_json=? WHERE id=1",
                         (config.model_dump_json(),))
        return self.config()

    def active_workload(self) -> dict:
        return {"active": dict(self._active) if self._active is not None else None,
                "serialization_enabled": self.config()["serialize_local_gpu"]}

    async def claim_local_gpu(self, kind: str) -> bool:
        """Serialize only requests known to share the local GPU.

        Does not unload models or manage external processes. A busy resource
        immediately rejects new work; there is no hidden background queue.
        """
        if not self.config()["serialize_local_gpu"]:
            return False
        if self._gpu_lock.locked():
            current = self._active["kind"] if self._active else "otra operación"
            raise HTTPException(409,
                "GPU local ocupada por " + current +
                ". Espera a que termine o desactiva la coordinación en Ajustes.")
        await self._gpu_lock.acquire()
        self._active = {"kind": kind, "started_at": time.time()}
        return True

    def release_local_gpu(self, acquired: bool) -> None:
        if acquired:
            self._active = None
            self._gpu_lock.release()

    def inspect(self) -> dict:
        policy = self.config()
        devices = gpu_snapshot()
        chosen = next((gpu for gpu in devices if gpu["index"] == policy["gpu_index"]), None)
        if not devices:
            status = "unknown"
            detail = "nvidia-smi no está disponible; no es posible determinar la VRAM."
        elif chosen is None:
            status = "unknown"
            detail = "No se encontró la GPU configurada."
        elif chosen["free_mib"] < policy["minimum_free_mib"]:
            status = "below_reserve"
            detail = "La VRAM libre observada está por debajo del mínimo configurado."
        else:
            status = "above_reserve"
            detail = "La VRAM libre observada supera el mínimo configurado; no garantiza que un checkpoint quepa."
        return {
            "policy": policy, "gpus": devices, "selected_gpu": chosen,
            "status": status, "observed_at": time.time(), "message": detail,
            "monitor_only": policy["mode"] == "monitor",
            "workload": self.active_workload(),
        }

    def allow_image_request(self, allow_low_vram: bool = False) -> dict:
        state = self.inspect()
        if (state["policy"]["mode"] == "guard" and
                state["status"] == "below_reserve" and not allow_low_vram):
            raise HTTPException(
                409, "VRAM libre inferior a la reserva configurada (" +
                str(state["policy"]["minimum_free_mib"]) +
                " MiB). Libera memoria, modifica Ajustes o permite esta ejecución explícitamente.")
        return state


def mount_resource_routes(app, resources: ResourceController):
    @app.get("/api/v1/resources/active")
    def active_resource_workload():
        return resources.active_workload()

    @app.get("/api/v1/resources/status")
    def resource_status():
        return resources.inspect()

    @app.get("/api/v1/resources/config")
    def resource_config():
        return resources.config()

    @app.put("/api/v1/resources/config")
    def update_resource_config(body: ResourceConfig):
        try:
            return resources.configure(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
