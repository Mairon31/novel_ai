"""Reproducible benchmark for Noble AI authenticated LLM workers.

Runs client-side against an actual worker endpoint. Reports only aggregate
timings, output sizes, GPU readings and model ID: never records tokens, URLs,
user prompts or generated story text.
Example:
  NOBLE_WORKER_TOKEN=... python tools/worker_benchmark.py \
      --url https://example.trycloudflare.com --runs 3 --output report.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import statistics
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * p
    low, high = math.floor(position), math.ceil(position)
    return values[low] + (values[high] - values[low]) * (position - low)


def safe_base(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError("URL inválida")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("No incluyas credenciales en URL")
    if parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "localhost"):
        raise ValueError("HTTP solo está permitido en loopback")
    if parsed.path not in ("", "/"):
        raise ValueError("Escribe la URL base, sin rutas")
    return url.rstrip("/")


async def snapshot(client: httpx.AsyncClient, base: str, headers: dict) -> dict | None:
    try:
        response = await client.get(base + "/v1/health", headers=headers, timeout=4)
        if response.status_code == 200:
            data = response.json()
            if data.get("protocol") == "noble-worker-v1":
                return data
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return None


async def benchmark(base: str, token: str, runs: int, timeout: int,
                    monitor_interval: float = 0.5) -> dict:
    headers = {"Authorization": "Bearer " + token}
    report: dict = {
        "schema": 1, "tool": "Noble AI worker benchmark",
        "endpoint_type": "local" if base.startswith("http://") else "cloudflare_or_https",
        "runs_requested": runs, "runs": [], "gpu_peak_used_mb": None,
        "gpu_peak_utilization_percent": None,
    }
    gpu_memory: list[int] = []
    gpu_utilization: list[int] = []

    async with httpx.AsyncClient(trust_env=False,
                                 timeout=httpx.Timeout(timeout, connect=15)) as client:
        # A tunnel to an unprotected server is a configuration error.
        bad = await client.get(
            base + "/v1/models",
            headers={"Authorization": "Bearer intentionally-wrong-token"},
            follow_redirects=False)
        if bad.status_code not in (401, 403):
            raise RuntimeError("La URL no rechaza tokens erróneos; no ejecutes el benchmark")

        available = await client.get(base + "/v1/models", headers=headers,
                                     follow_redirects=False)
        available.raise_for_status()
        models = available.json().get("data", [])
        ids = [item.get("id") for item in models
               if isinstance(item, dict) and isinstance(item.get("id"), str)]
        if not ids:
            raise RuntimeError("El worker no anunció modelos en /v1/models")
        model = ids[0]
        report["model"] = model
        initial = await snapshot(client, base, headers)
        if initial:
            report["worker_protocol"] = initial.get("protocol")
            report["engine_status"] = initial.get("engine_status")
            report["gpu"] = [
                {"index": g.get("index"), "name": g.get("name"),
                 "vram_total_mb": g.get("vram_total_mb")}
                for g in initial.get("gpu", []) if isinstance(g, dict)
            ]

        stop_monitor = asyncio.Event()

        async def monitor():
            while not stop_monitor.is_set():
                item = await snapshot(client, base, headers)
                if item:
                    for gpu in item.get("gpu", []):
                        if not isinstance(gpu, dict):
                            continue
                        if isinstance(gpu.get("vram_used_mb"), int):
                            gpu_memory.append(gpu["vram_used_mb"])
                        if isinstance(gpu.get("utilization_percent"), int):
                            gpu_utilization.append(gpu["utilization_percent"])
                try:
                    await asyncio.wait_for(stop_monitor.wait(), monitor_interval)
                except asyncio.TimeoutError:
                    pass

        watch = asyncio.create_task(monitor())
        try:
            for index in range(runs):
                # Small neutral scene generated for performance checks only.
                payload = {
                    "model": model, "stream": True, "temperature": 0.6,
                    "max_tokens": 160, "messages": [
                        {"role": "system", "content": (
                            "Eres un narrador. Escribe una escena corta en español latinoamericano.")},
                        {"role": "user", "content": (
                            "Describe una biblioteca fantástica al atardecer en dos párrafos.")},
                    ],
                }
                start = time.perf_counter()
                first_content_ms = None
                text_chars = 0
                completion_tokens = None
                saw_done = False
                try:
                    async with client.stream("POST", base + "/v1/chat/completions",
                                             json=payload, headers=headers,
                                             follow_redirects=False) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            raw = line.removeprefix("data:").strip()
                            if raw == "[DONE]":
                                saw_done = True
                                break
                            try:
                                data = json.loads(raw)
                            except ValueError:
                                continue
                            choices = data.get("choices") or []
                            piece = (choices[0].get("delta") or {}).get("content") if choices else None
                            if isinstance(piece, str) and piece:
                                if first_content_ms is None:
                                    first_content_ms = (time.perf_counter() - start) * 1000
                                text_chars += len(piece)
                            usage = data.get("usage") or {}
                            if isinstance(usage.get("completion_tokens"), int):
                                completion_tokens = usage["completion_tokens"]
                    duration_ms = (time.perf_counter() - start) * 1000
                    valid = bool(first_content_ms is not None and text_chars and saw_done)
                    record = {
                        "run": index + 1, "success": valid,
                        "duration_ms": round(duration_ms, 1),
                        "time_to_first_content_ms": round(first_content_ms, 1)
                        if first_content_ms is not None else None,
                        "output_characters": text_chars,
                        "completion_tokens_reported": completion_tokens,
                        "tokens_per_second": round(
                            completion_tokens / max(duration_ms / 1000, 0.001), 2
                        ) if completion_tokens is not None else None,
                        "error": None if valid else "Sin contenido o sin marcador [DONE]",
                    }
                except (httpx.HTTPError, ValueError) as exc:
                    record = {
                        "run": index + 1, "success": False,
                        "error": type(exc).__name__,
                        "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                        "time_to_first_content_ms": None,
                        "output_characters": 0,
                        "completion_tokens_reported": None, "tokens_per_second": None,
                    }
                report["runs"].append(record)
        finally:
            stop_monitor.set()
            await watch

    succeeded = [r for r in report["runs"] if r["success"]]
    report["runs_succeeded"] = len(succeeded)
    report["runs_failed"] = runs - len(succeeded)
    ttfts = [r["time_to_first_content_ms"] for r in succeeded
             if r["time_to_first_content_ms"] is not None]
    report["ttft_p50_ms"] = round(percentile(ttfts, .5), 1) if ttfts else None
    report["ttft_p95_ms"] = round(percentile(ttfts, .95), 1) if ttfts else None
    report["gpu_peak_used_mb"] = max(gpu_memory) if gpu_memory else None
    report["gpu_peak_utilization_percent"] = max(gpu_utilization) if gpu_utilization else None
    report["note"] = ("Time-to-first-content is measured client-side after authentication, "
                      "proxy and tunnel. tokens_per_second is null unless the model reports "
                      "completion_tokens. GPU memory is sampled, not guaranteed peak.")
    return report


def main():
    parser = argparse.ArgumentParser(description="Benchmark a Noble AI authenticated worker")
    parser.add_argument("--url", required=True, help="Worker base URL, no API key")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--output", default="noble-worker-benchmark.json")
    options = parser.parse_args()
    if not (1 <= options.runs <= 20) or not (10 <= options.timeout <= 600):
        parser.error("runs: 1..20; timeout: 10..600")
    token = os.getenv("NOBLE_WORKER_TOKEN", "")
    if len(token) < 24:
        parser.error("Exporta NOBLE_WORKER_TOKEN con al menos 24 caracteres")
    result = asyncio.run(benchmark(safe_base(options.url), token,
                                   options.runs, options.timeout))
    location = Path(options.output).expanduser()
    location.parent.mkdir(parents=True, exist_ok=True)
    location.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print("Pruebas:", result["runs_succeeded"], "/", result["runs_requested"])
    print("TTFT P50 / P95 (ms):", result["ttft_p50_ms"], "/", result["ttft_p95_ms"])
    print("VRAM máxima observada (MB):", result["gpu_peak_used_mb"])
    print("Reporte:", location)


if __name__ == "__main__":
    main()
