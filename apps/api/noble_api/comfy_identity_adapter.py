"""Explicit IPAdapter Plus identity conditioning for ComfyUI sprite drafts.

This integration speaks to the installed plugin's real class mappings:
IPAdapterUnifiedLoader and IPAdapter. It never downloads weights, substitutes
the author's selected reference, or falls back to plain diffusion silently.
"""
from __future__ import annotations

import re
import httpx
from fastapi import HTTPException

PRESETS = (
    "STANDARD (medium strength)",
    "PLUS (high strength)",
    "PLUS FACE (portraits)",
)
DEFAULT_PRESET = "PLUS FACE (portraits)"
MODEL_FOLDERS = ("ipadapter", "clip_vision")


def inject_ipadapter(nodes: dict, reference_name: str, preset: str,
                     weight: float) -> dict:
    """Apply reference IMAGE to the *model* path after optional LoRAs.

    The same LoadImage is separate from VAEEncode. IPAdapter works with a
    fresh latent and does not require img2img denoise.
    """
    if preset not in PRESETS or not 0.1 <= weight <= 1.5:
        raise ValueError("Invalid IPAdapter preset or weight")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,180}", reference_name):
        raise ValueError("Invalid IPAdapter reference image name")
    if any(node in nodes for node in ("20", "21", "22")):
        raise ValueError("IPAdapter node IDs 20-22 are already in use")
    model = nodes["5"]["inputs"]["model"]
    nodes["20"] = {"class_type": "IPAdapterUnifiedLoader", "inputs": {
        "model": model, "preset": preset}}
    nodes["21"] = {"class_type": "LoadImage", "inputs": {"image": reference_name}}
    nodes["22"] = {"class_type": "IPAdapter", "inputs": {
        "model": ["20", 0], "ipadapter": ["20", 1], "image": ["21", 0],
        "weight": float(weight), "start_at": 0.0, "end_at": 1.0,
        "weight_type": "standard",
    }}
    nodes["5"]["inputs"]["model"] = ["22", 0]
    return nodes


def _required(node: object, fields: set[str], name: str) -> dict:
    if not isinstance(node, dict):
        raise ValueError("Missing node " + name)
    field = node.get("input")
    needed = field.get("required") if isinstance(field, dict) else None
    if not isinstance(needed, dict) or not fields.issubset(needed):
        raise ValueError("Incompatible node schema: " + name)
    return needed


def validate_identity_adapter_nodes(loader: object, adapter: object) -> list[str]:
    """Reject mismatched plugin versions before enqueuing GPU work."""
    required = _required(loader, {"model", "preset"}, "IPAdapterUnifiedLoader")
    _required(adapter, {"model", "ipadapter", "image", "weight",
                        "start_at", "end_at", "weight_type"}, "IPAdapter")
    preset_spec = required["preset"]
    if (not isinstance(preset_spec, list) or not preset_spec
            or not isinstance(preset_spec[0], list)):
        raise ValueError("Invalid IPAdapter preset list")
    return [item for item in PRESETS if item in preset_spec[0]]


async def identity_adapter_status(base_url: str, transport=None) -> dict:
    """Check installed nodes and model folders only on explicit request."""
    try:
        async with httpx.AsyncClient(transport=transport, trust_env=False,
                                    timeout=8) as client:
            loader = await client.get(base_url + "/object_info/IPAdapterUnifiedLoader",
                                      follow_redirects=False)
            adapter = await client.get(base_url + "/object_info/IPAdapter",
                                       follow_redirects=False)
            loader.raise_for_status()
            adapter.raise_for_status()
            loader_data, adapter_data = loader.json(), adapter.json()
            presets = validate_identity_adapter_nodes(
                loader_data.get("IPAdapterUnifiedLoader")
                if isinstance(loader_data, dict) else None,
                adapter_data.get("IPAdapter") if isinstance(adapter_data, dict) else None)
            if not presets:
                raise ValueError("IPAdapter installation provides no compatible presets")
            counts = {}
            for folder in MODEL_FOLDERS:
                response = await client.get(base_url + "/models/" + folder,
                                            follow_redirects=False)
                response.raise_for_status()
                names = response.json()
                if (not isinstance(names, list) or len(names) > 20000 or
                        not all(isinstance(x, str) for x in names)):
                    raise ValueError("Invalid IPAdapter catalog: " + folder)
                counts[folder] = len(names)
            if not all(counts.values()):
                raise ValueError("Install compatible IPAdapter and CLIP Vision models")
        return {"available": True, "presets": presets,
                "model_count": counts["ipadapter"],
                "clip_vision_count": counts["clip_vision"], "error": None}
    except (httpx.HTTPError, ValueError) as exc:
        return {"available": False, "presets": [], "model_count": 0,
                "clip_vision_count": 0, "error": str(exc)[:180]}


def require_ipadapter_status(status: dict, preset: str) -> None:
    if not status["available"]:
        raise HTTPException(
            422, "IPAdapter Plus is not ready: " + (status["error"] or "no models"))
    if preset not in status["presets"]:
        raise HTTPException(422, "IPAdapter preset unavailable: " + preset)
