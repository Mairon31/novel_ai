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
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse


def validate_upstream(url: str) -> str:
    try:
        x = urlsplit(url)
        if (x.scheme != "http" or x.hostname not in {"127.0.0.1", "localhost", "::1"}
                or not x.port or x.port < 1024 or x.port > 65535
                or x.path not in ("", "/") or x.username or x.password
                or x.query or x.fragment):
            raise ValueError("Upstream fuera de loopback")
    except (ValueError, AttributeError) as exc:
        raise ValueError("NOBLE_WORKER_UPSTREAM debe ser HTTP local con puerto") from exc
    return url.rstrip("/")


def create_worker_app(token: str, upstream: str,
                      transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    if len(token) < 24:
        raise ValueError("NOBLE_WORKER_TOKEN requiere 24 caracteres como mínimo")
    base = validate_upstream(upstream)
    service = FastAPI(title="Noble AI Authenticated Worker", version="0.1")

    @service.middleware("http")
    async def authenticate(request: Request, call_next):
        provided = request.headers.get("authorization", "")
        expected = "Bearer " + token
        if not hmac.compare_digest(provided.encode(), expected.encode()):
            return JSONResponse({"detail": "Token de worker inválido"}, status_code=401)
        return await call_next(request)

    @service.get("/v1/models")
    async def models():
        try:
            async with httpx.AsyncClient(transport=transport, trust_env=False,
                                         timeout=12) as client:
                result = await client.get(base + "/v1/models", follow_redirects=False)
                result.raise_for_status()
                data = result.json()
                if not isinstance(data, dict):
                    raise ValueError("Catálogo inválido")
                return data
        except (ValueError, httpx.HTTPError) as exc:
            raise HTTPException(502, "Motor local sin respuesta: " + str(exc)[:170]) from exc

    @service.post("/v1/chat/completions")
    async def completions(request: Request):
        if int(request.headers.get("content-length", "0") or 0) > 1024 * 1024:
            raise HTTPException(413, "El prompt supera el límite de 1 MB")
        body = await request.body()
        if len(body) > 1024 * 1024:
            raise HTTPException(413, "El prompt supera el límite de 1 MB")
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(422, "Se espera un JSON válido")
        if (not isinstance(payload, dict) or not isinstance(payload.get("model"), str)
                or not isinstance(payload.get("messages"), list)):
            raise HTTPException(422, "El modelo y los mensajes son obligatorios")
        # Remote client cannot override the upstream URL or add arbitrary proxy routes.
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
                raise HTTPException(502, "El motor local respondió HTTP " + str(status))
        except (OSError, httpx.HTTPError) as exc:
            await client.aclose()
            raise HTTPException(502, "No se pudo contactar el motor local") from exc

        async def relay():
            try:
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
            finally:
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
