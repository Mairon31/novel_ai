"""Bounded, privacy-preserving worker telemetry.

No prompts, outputs, tokens or client IP addresses are retained. GPU readings are
best-effort from nvidia-smi; their absence does not mean GPU use is disabled.
"""
from __future__ import annotations

import subprocess
import threading
import time
from collections import deque


def gpu_snapshot() -> list[dict]:
    try:
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used,utilization.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3, check=True)
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return []
    result = []
    for index, line in enumerate(proc.stdout.splitlines()[:8]):
        parts = [item.strip() for item in line.split(",")]
        if len(parts) != 4:
            continue
        try:
            result.append({
                "index": index, "name": parts[0][:120],
                "vram_total_mb": int(parts[1]),
                "vram_used_mb": int(parts[2]),
                "utilization_percent": int(parts[3]),
            })
        except ValueError:
            continue
    return result


class WorkerTelemetry:
    def __init__(self):
        self.started = time.monotonic()
        self._lock = threading.Lock()
        self.active = 0
        self.completed = 0
        self.failed = 0
        self._recent: deque[dict] = deque(maxlen=40)

    def begin(self) -> float:
        with self._lock:
            self.active += 1
        return time.perf_counter()

    def finish(self, start: float, first_token_ms: float | None,
               bytes_sent: int, ok: bool) -> None:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        with self._lock:
            self.active = max(self.active - 1, 0)
            if ok:
                self.completed += 1
            else:
                self.failed += 1
            self._recent.append({
                "duration_ms": duration_ms,
                "ttft_ms": first_token_ms,
                "stream_bytes": bytes_sent,
                "completed": ok,
            })

    def snapshot(self) -> dict:
        with self._lock:
            good = [item for item in self._recent if item["completed"]]
            ttfts = [item["ttft_ms"] for item in good if item["ttft_ms"] is not None]
            return {
                "uptime_s": round(time.monotonic() - self.started, 1),
                "active_requests": self.active,
                "completed_requests": self.completed,
                "failed_requests": self.failed,
                "recent_requests": len(self._recent),
                "last_ttft_ms": ttfts[-1] if ttfts else None,
                "avg_ttft_ms": round(sum(ttfts) / len(ttfts), 1) if ttfts else None,
                "avg_duration_ms": round(sum(i["duration_ms"] for i in good) / len(good), 1)
                if good else None,
            }
