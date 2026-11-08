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

from .model_fit import gguf_metadata

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
        raise CatalogError(400, "Invalid repository identifier")
    return repo


def validate_variant(revision: str, filename: str) -> None:
    if not REVISION.fullmatch(revision):
        raise CatalogError(400, "Select a complete repository SHA revision")
    if not FILENAME.fullmatch(filename) or filename.startswith("."):
        raise CatalogError(400, "Only individual GGUF files at the repository root are currently supported")


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
                raise CatalogError(429, "Hugging Face rate-limited requests. Try again later.")
            if response.status_code in (401, 403):
                raise CatalogError(403, "This model requires access or acceptance of terms on Hugging Face.")
            if response.status_code == 404:
                raise CatalogError(404, "Model not found on Hugging Face.")
            response.raise_for_status()
            return response.json()
        except CatalogError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise CatalogError(502, "Could not query Hugging Face: " + str(exc)) from exc

    def _cached(self, key: tuple, call):
        with self._lock:
            entry = self._cache.get(key)
            if entry and time.monotonic() - entry[0] < 300:
                return entry[1]
        result = call()
        with self._lock:
            self._cache[key] = (time.monotonic(), result)
        return result

    def search(self, query: str, role: str, limit: int = 20,
               sort: str = "downloads") -> dict:
        if role not in ROLES:
            raise CatalogError(400, "Invalid model role")
        query = query.strip()[:100]
        if len(query) < 2:
            raise CatalogError(400, "Enter at least two characters")
        limit = max(1, min(limit, 30))
        if sort not in {"downloads", "likes", "lastModified", "trendingScore"}:
            raise CatalogError(400, "Invalid catalog sort order")
        params = {"search": query, "filter": ROLE_FILTERS[role],
                  "sort": sort, "direction": "-1", "limit": limit}
        data = self._cached(("search", role, query.lower(), limit, sort),
                            lambda: self._get("/api/models", params))
        if not isinstance(data, list):
            raise CatalogError(502, "Unexpected catalog response")
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
                "description": model.get("pipeline_tag") or "Hugging Face model",
                "downloads": model.get("downloads") or 0,
                "likes": model.get("likes") or 0,
                "gated": bool(model.get("gated")),
                "license": (model.get("cardData") or {}).get("license") or "sin verificar",
                "updated": model.get("lastModified"),
                "role": role,
            })
        return {"source": "huggingface", "role": role, "query": query,
                "sort": sort,
                "results": items, "installation_supported": role == "narrator",
                "cached_seconds": 300}

    def header(self, repo_id: str, revision: str, filename: str) -> dict:
        """Bounded HF range request. Never download a full GGUF for metadata."""
        validate_repo(repo_id)
        validate_variant(revision, filename)
        def fetch():
            url = ("https://huggingface.co/" + repo_id + "/resolve/" +
                   revision + "/" + quote(filename))
            try:
                with self.client.stream("GET", url, headers={
                        "Range": "bytes=0-524287",
                        "Accept-Encoding": "identity"}) as response:
                    if response.status_code != 206:
                        return {}
                    buffer = bytearray()
                    for part in response.iter_bytes():
                        buffer.extend(part[:max(0,524288-len(buffer))])
                        if len(buffer) >= 524288:
                            break
                return gguf_metadata(bytes(buffer))
            except (httpx.HTTPError, ValueError):
                return {}
        return self._cached(("header",repo_id,revision,filename),fetch)

    def model_card(self, repo_id: str, revision: str) -> dict:
        """Read an upstream model card only on request.

        Inspired by Urakatsu ModelsPage's model-card inspector (MIT). Text is
        rendered as text, never as HTML; limit network reads to 128 KiB.
        """
        validate_repo(repo_id)
        if not REVISION.fullmatch(revision):
            raise CatalogError(400, "Model card requires a valid SHA revision")
        max_bytes = 128 * 1024
        url = ("/" + quote(repo_id, safe="/") + "/resolve/" +
               revision + "/README.md")

        def fetch():
            try:
                with self.client.stream("GET",
                        "https://huggingface.co" + url,
                        headers={"Accept-Encoding": "identity"}) as response:
                    if response.status_code == 404:
                        return {"readme": "", "truncated": False, "available": False}
                    if response.status_code in (401, 403):
                        raise CatalogError(403, "Restricted-access model card")
                    if response.status_code == 429:
                        raise CatalogError(429, "Hugging Face rate-limited model card requests")
                    response.raise_for_status()
                    raw = bytearray()
                    truncated = False
                    for chunk in response.iter_bytes():
                        remaining = max_bytes + 1 - len(raw)
                        raw.extend(chunk[:remaining])
                        if len(raw) > max_bytes:
                            truncated = True
                            break
                    return {
                        "readme": bytes(raw[:max_bytes]).decode("utf-8", errors="replace"),
                        "truncated": truncated,
                        "available": True,
                    }
            except CatalogError:
                raise
            except (httpx.HTTPError, ValueError) as exc:
                raise CatalogError(502, "Could not retrieve the model card") from exc

        return self._cached(("model_card", repo_id, revision), fetch)

    def details(self, repo_id: str) -> dict:
        validate_repo(repo_id)
        data = self._cached(("detail", repo_id), lambda: self._get(
            "/api/models/" + quote(repo_id, safe="/"), {"blobs": "true"}
        ))
        if not isinstance(data, dict):
            raise CatalogError(502, "Unexpected model details response")
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
        card = data.get("cardData") if isinstance(data.get("cardData"),dict) else {}
        raw_summary = card.get("description") or data.get("description") or ""
        summary = raw_summary[:700] if isinstance(raw_summary,str) else ""
        return {"repo_id": repo_id, "revision": revision,
                "license": card.get("license") or "sin verificar",
                "gated": bool(data.get("gated")),
                "pipeline_tag": data.get("pipeline_tag"),
                "author": data.get("author") or repo_id.split("/")[0],
                "downloads": int(data.get("downloads") or 0),
                "likes": int(data.get("likes") or 0),
                "last_modified": data.get("lastModified"),
                "library": data.get("library_name"),
                "tags": [x for x in data.get("tags",[]) if isinstance(x,str)][:24],
                "summary": summary,
                "base_model": card.get("base_model"),
                "variants": variants, "variant_kind": "gguf",
                "supports_install": bool(variants) and bool(REVISION.fullmatch(revision)),
                "url": "https://huggingface.co/" + repo_id}
