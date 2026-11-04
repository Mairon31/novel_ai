"""Conservative hardware discovery: never infer an NVIDIA GPU without nvidia-smi."""
from __future__ import annotations

import os
import platform
import shutil
import subprocess

import psutil


def snapshot(models_dir: str) -> dict:
    memory = psutil.virtual_memory()
    storage = shutil.disk_usage(models_dir)
    gpus = []
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.free,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, check=True, timeout=5,
        )
        for index, line in enumerate(result.stdout.splitlines()):
            parts = [part.strip() for part in line.split(",")]
            if len(parts) != 4:
                continue
            try:
                gpus.append({
                    "index": index, "name": parts[0], "backend": "cuda",
                    "vram_total_mb": int(parts[1]), "vram_free_mb": int(parts[2]),
                    "driver": parts[3],
                })
            except ValueError:
                continue
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass

    return {
        "os": platform.system(), "os_release": platform.release(),
        "cpu": platform.processor() or platform.machine(),
        "logical_cores": os.cpu_count() or 1,
        "ram_total_mb": round(memory.total / 1024**2),
        "ram_available_mb": round(memory.available / 1024**2),
        "storage_free_gb": round(storage.free / 1024**3, 1),
        "gpus": gpus,
        "device_options": ["cpu"] + (["cuda"] if gpus else []),
        "fit_is_estimate": True,
    }
