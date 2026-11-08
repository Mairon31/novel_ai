"""A small authenticated gateway between a GPU inference server and Cloudflare Tunnel.

Example:
  NOBLE_WORKER_TOKEN=<long-secret> NOBLE_WORKER_UPSTREAM=http://127.0.0.1:5001 \
      uvicorn noble_api.worker_server:app --app-dir apps/api --host 127.0.0.1 --port 8765
  cloudflared tunnel --url http://127.0.0.1:8765

No /admin, file access, process launch, remote URLs or unsecured endpoints.
The upstream MUST be on this machine's loopback interface.
"""
from __future__ import annotations

import hmac
import json
import os
import time
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .worker_telemetry import WorkerTelemetry, gpu_snapshot


def validate_upstream(url: str) -> str:
    try:
        x = urlsplit(url)
        if (x.scheme != "http" or x.hostname not in {"127.0.0.1", "localhost", "::1"}
                or not x.port or x.port < 1024 or x.port > 65535
                or x.path not in ("", "/") or x.username or x.password
                or x.query or x.fragment):
            raise ValueError("Upstream must be a loopback address")
    except (ValueError, AttributeError) as exc:
        raise ValueError("NOBLE_WORKER_UPSTREAM must be a local HTTP URL with a port") from exc
    return url.rstrip("/")


def create_worker_app(token: str, upstream: str,
                      transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    if len(token) < 24:
        raise ValueError("NOBLE_WORKER_TOKEN requires at least 24 characters")
    base = validate_upstream(upstream)
    telemetry = WorkerTelemetry()
    service = FastAPI(title="Noble AI Authenticated Worker", version="0.1")

    @service.middleware("http")
    async def authenticate(request: Request, call_next):
        provided = request.headers.get("authorization", "")
        expected = "Bearer " + token
        if not hmac.compare_digest(provided.encode(), expected.encode()):
            return JSONResponse({"detail": "Invalid worker token"}, status_code=401)
        return await call_next(request)

    @service.get("/v1/health")
    async def health():
        # Remains authenticated by the middleware; exposes no prompts or tokens.
        data = telemetry.snapshot()
        data.update({"protocol": "noble-worker-v1", "gpu": gpu_snapshot()})
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(transport=transport, trust_env=False,
                                         timeout=5) as client:
                response = await client.get(base + "/v1/models", follow_redirects=False)
                response.raise_for_status()
                payload = response.json()
                data["models_count"] = len(payload.get("data", []))
                data["engine_status"] = "ready"
        except (httpx.HTTPError, ValueError, KeyError, AttributeError):
            data["engine_status"] = "unavailable"
            data["models_count"] = 0
        data["engine_latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        return data

    @service.get("/v1/models")
    async def models():
        try:
            async with httpx.AsyncClient(transport=transport, trust_env=False,
                                         timeout=12) as client:
                result = await client.get(base + "/v1/models", follow_redirects=False)
                result.raise_for_status()
                data = result.json()
                if not isinstance(data, dict):
                    raise ValueError("Invalid catalog")
                return data
        except (ValueError, httpx.HTTPError) as exc:
            raise HTTPException(502, "Local engine did not respond: " + str(exc)[:170]) from exc

    @service.post("/v1/chat/completions")
    async def completions(request: Request):
        # Enforce a hard byte cap even for chunked transfer encoding.
        body = bytearray()
        async for part in request.stream():
            body.extend(part)
            if len(body) > 1024 * 1024:
                raise HTTPException(413, "Prompt exceeds the 1 MB limit")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(422, "Valid JSON is required")
        if (not isinstance(payload, dict) or not isinstance(payload.get("model"), str)
                or not isinstance(payload.get("messages"), list)):
            raise HTTPException(422, "Model and messages are required")
        # Remote client cannot override the upstream URL or add arbitrary proxy routes.
        start = telemetry.begin()
        client = httpx.AsyncClient(transport=transport, trust_env=False,
                                   timeout=httpx.Timeout(240, connect=5, read=240, write=20, pool=5))
        try:
            upstream_request = client.build_request(
                "POST", base + "/v1/chat/completions", json=payload)
            response = await client.send(upstream_request, stream=True, follow_redirects=False)
            if response.status_code != 200:
                status = response.status_code
                await response.aclose()
                await client.aclose()
                telemetry.finish(start, None, 0, False)
                raise HTTPException(502, "Local engine returned HTTP " + str(status))
        except (OSError, httpx.HTTPError) as exc:
            await client.aclose()
            telemetry.finish(start, None, 0, False)
            raise HTTPException(502, "Could not contact the local engine") from exc

        async def relay():
            first_chunk_ms = None
            stream_bytes = 0
            complete = False
            try:
                async for chunk in response.aiter_bytes():
                    if chunk:
                        if first_chunk_ms is None:
                            first_chunk_ms = round((time.perf_counter() - start) * 1000, 1)
                        stream_bytes += len(chunk)
                        yield chunk
                complete = True
            finally:
                telemetry.finish(start, first_chunk_ms, stream_bytes, complete)
                await response.aclose()
                await client.aclose()

        return StreamingResponse(relay(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    return service


app = create_worker_app(
    os.getenv("NOBLE_WORKER_TOKEN", ""),
    os.getenv("NOBLE_WORKER_UPSTREAM", "http://127.0.0.1:5001"),
)
