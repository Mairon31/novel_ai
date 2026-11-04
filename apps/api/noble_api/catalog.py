"""Hugging Face public REST catalog; search is live (with bounded in-memory cache).

This catalog initially *installs only single-file GGUF narrators*. Image/TTS
results are discoverable but require provider-specific installers in later phases.
No remote model code is executed.
"""
from __future__ import annotations

import re
import threading
import time
from urllib.parse import quote

import httpx

ROLES = {"narrator", "image", "tts"}
ROLE_FILTERS = {"narrator": "gguf", "image": "text-to-image", "tts": "text-to-speech"}
REPO_PART = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
REVISION = re.compile(r"^[a-fA-F0-9]{40}$")
FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+()-]{0,250}\.gguf$", re.IGNORECASE)
HEX_SHA256 = re.compile(r"^[a-fA-F0-9]{64}$")


class CatalogError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def validate_repo(repo: str) -> str:
    parts = repo.split("/")
    if len(parts) != 2 or any(not REPO_PART.fullmatch(p) or ".." in p for p in parts):
        raise CatalogError(400, "Identificador de repositorio inválido")
    return repo


def validate_variant(revision: str, filename: str) -> None:
    if not REVISION.fullmatch(revision):
        raise CatalogError(400, "Selecciona una revisión SHA completa del repositorio")
    if not FILENAME.fullmatch(filename) or filename.startswith("."):
        raise CatalogError(400, "Por ahora solo se instalan GGUF individuales en la raíz del repo")


class HfCatalog:
    def __init__(self, transport: httpx.BaseTransport | None = None):
        self.client = httpx.Client(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True, transport=transport,
            headers={"User-Agent": "NobleAI/0.1 (local-model-hub)"},
        )
        self._cache: dict[tuple, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def close(self) -> None:
        self.client.close()

    def _get(self, path: str, params: dict | None = None) -> object:
        try:
            response = self.client.get("https://huggingface.co" + path, params=params)
            if response.status_code == 429:
                raise CatalogError(429, "Hugging Face limitó las solicitudes. Inténtalo más tarde.")
            if response.status_code in (401, 403):
                raise CatalogError(403, "Este modelo requiere acceso o aceptación de condiciones en Hugging Face.")
            if response.status_code == 404:
                raise CatalogError(404, "No se encontró el modelo en Hugging Face.")
            response.raise_for_status()
            return response.json()
        except CatalogError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise CatalogError(502, "No se pudo consultar Hugging Face: " + str(exc)) from exc

    def _cached(self, key: tuple, call):
        with self._lock:
            entry = self._cache.get(key)
            if entry and time.monotonic() - entry[0] < 300:
                return entry[1]
        result = call()
        with self._lock:
            self._cache[key] = (time.monotonic(), result)
        return result

    def search(self, query: str, role: str, limit: int = 20) -> dict:
        if role not in ROLES:
            raise CatalogError(400, "Rol de modelo inválido")
        query = query.strip()[:100]
        if len(query) < 2:
            raise CatalogError(400, "Busca al menos dos caracteres")
        limit = max(1, min(limit, 30))
        params = {"search": query, "filter": ROLE_FILTERS[role],
                  "sort": "downloads", "direction": "-1", "limit": limit}
        data = self._cached(("search", role, query.lower(), limit),
                            lambda: self._get("/api/models", params))
        if not isinstance(data, list):
            raise CatalogError(502, "Respuesta de catálogo inesperada")
        items = []
        for model in data:
            if not isinstance(model, dict):
                continue
            repo = model.get("id") or model.get("modelId")
            try:
                validate_repo(repo)
            except (CatalogError, TypeError):
                continue
            items.append({
                "repo_id": repo, "revision": model.get("sha"),
                "description": model.get("pipeline_tag") or "Modelo de Hugging Face",
                "downloads": model.get("downloads") or 0,
                "likes": model.get("likes") or 0,
                "gated": bool(model.get("gated")),
                "license": (model.get("cardData") or {}).get("license") or "sin verificar",
                "updated": model.get("lastModified"),
                "role": role,
            })
        return {"source": "huggingface", "role": role, "query": query,
                "results": items, "installation_supported": role == "narrator",
                "cached_seconds": 300}

    def details(self, repo_id: str) -> dict:
        validate_repo(repo_id)
        data = self._cached(("detail", repo_id), lambda: self._get(
            "/api/models/" + quote(repo_id, safe="/"), {"blobs": "true"}
        ))
        if not isinstance(data, dict):
            raise CatalogError(502, "Respuesta de detalle inesperada")
        revision = data.get("sha") or ""
        variants = []
        for item in data.get("siblings") or []:
            if not isinstance(item, dict):
                continue
            filename = item.get("rfilename") or ""
            # In P0.5, split GGUF and subfolders are intentionally unsupported.
            if "/" in filename or not FILENAME.fullmatch(filename):
                continue
            lfs = item.get("lfs") or {}
            oid = (lfs.get("oid") or "").replace("sha256:", "")
            variants.append({
                "filename": filename,
                "size_bytes": item.get("size") or lfs.get("size") or None,
                "sha256": oid.lower() if HEX_SHA256.fullmatch(oid) else None,
                "supported": not bool(re.search(r"-\d{5}-of-\d{5}\.gguf$", filename, re.I)),
            })
        return {"repo_id": repo_id, "revision": revision,
                "license": (data.get("cardData") or {}).get("license") or "sin verificar",
                "gated": bool(data.get("gated")),
                "pipeline_tag": data.get("pipeline_tag"),
                "variants": variants, "variant_kind": "gguf",
                "supports_install": bool(variants) and bool(REVISION.fullmatch(revision)),
                "url": "https://huggingface.co/" + repo_id}
