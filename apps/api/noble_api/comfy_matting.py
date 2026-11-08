"""Opt-in, locally installed ComfyUI-RMBG matting for sprite drafts.

Models and node signatures match 1038lab/ComfyUI-RMBG (v3.3.x).
The plugin can download missing weights when it runs, so Noble requires all
expected files in ComfyUI's /models/rmbg inventory before it sends /prompt.
Nothing here installs weights or offers an unreported fallback to chroma.
"""
from __future__ import annotations

import httpx
from fastapi import HTTPException

MODELS = {
    "neural_rmbg2": {
        "class": "RMBG", "model": "RMBG-2.0",
        "expected": (
            "RMBG-2.0/config.json", "RMBG-2.0/model.safetensors",
            "RMBG-2.0/birefnet.py", "RMBG-2.0/BiRefNet_config.py",
        ),
        "method": "neural_rmbg",
    },
    "neural_birefnet_portrait": {
        "class": "BiRefNetRMBG", "model": "BiRefNet-portrait",
        "expected": (
            "BiRefNet/config.json", "BiRefNet/BiRefNet-portrait.safetensors",
            "BiRefNet/birefnet.py", "BiRefNet/BiRefNet_config.py",
        ),
        "method": "neural_birefnet",
    },
    "neural_birefnet_matting": {
        "class": "BiRefNetRMBG", "model": "BiRefNet-matting",
        "expected": (
            "BiRefNet/config.json", "BiRefNet/BiRefNet-matting.safetensors",
            "BiRefNet/birefnet.py", "BiRefNet/BiRefNet_config.py",
        ),
        "method": "neural_birefnet",
    },
}
CHROMA = "chroma_green"
ALL_MODES = (CHROMA, *MODELS)


def inject_matte(nodes: dict, mode: str) -> dict:
    """Add the actual image/mask outputs of a single RMBG node into the graph.

    SaveImage may lose an IMAGE's alpha; export MASK separately via native
    MaskToImage and combine in Noble instead of trusting an opaque PNG.
    """
    if mode not in MODELS:
        raise ValueError("Unknown neural background removal provider")
    if any(key in nodes for key in ("23", "24", "25")):
        raise ValueError("Matting node ID conflict")
    spec = MODELS[mode]
    inputs = {
        "image": ["6", 0], "model": spec["model"],
        "sensitivity": 1.0, "mask_blur": 0, "mask_offset": 0,
        "invert_output": False, "refine_foreground": True,
        "unload_model": True, "background": "Alpha",
        "background_color": "#222222",
    }
    if spec["class"] == "RMBG":
        inputs["process_res"] = 1024
    nodes["23"] = {"class_type": spec["class"], "inputs": inputs}
    nodes["7"]["inputs"]["images"] = ["23", 0]
    nodes["24"] = {"class_type": "MaskToImage",
                   "inputs": {"mask": ["23", 1]}}
    nodes["25"] = {"class_type": "SaveImage", "inputs": {
        "images": ["24", 0], "filename_prefix": "NobleAI-Sprite-Matte"}}
    return nodes


def _validate_node(info: object, spec: dict) -> None:
    if not isinstance(info, dict):
        raise ValueError("Missing node " + spec["class"])
    fields = info.get("input")
    if not isinstance(fields, dict):
        raise ValueError("Invalid RMBG node schema")
    required = fields.get("required")
    optional = fields.get("optional")
    if not isinstance(required, dict) or not {"image", "model"} <= set(required):
        raise ValueError("Required RMBG inputs are unavailable")
    if not isinstance(optional, dict) or not {
            "background", "refine_foreground", "unload_model",
            "mask_blur", "mask_offset", "invert_output", "sensitivity"
    } <= set(optional):
        raise ValueError("RMBG version does not support alpha masks")
    if spec["class"] == "RMBG" and "process_res" not in optional:
        raise ValueError("RMBG version has no resolution control")
    model_field = required.get("model")
    backgrounds = optional.get("background")
    if (not isinstance(model_field, list) or not model_field
            or not isinstance(model_field[0], list)
            or spec["model"] not in model_field[0]):
        raise ValueError("RMBG model not offered by the node")
    if (not isinstance(backgrounds, list) or not backgrounds
            or not isinstance(backgrounds[0], list)
            or "Alpha" not in backgrounds[0]):
        raise ValueError("RMBG node has no alpha output")
    

async def matting_status(base_url: str, transport=None) -> dict:
    """Read node definitions and registered local model files without inference."""
    models = list(MODELS.items())
    entries = [{"mode": name, "model": spec["model"],
                "node": spec["class"], "ready": False, "reason": ""}
               for name, spec in models]
    try:
        async with httpx.AsyncClient(
                transport=transport, trust_env=False, timeout=8) as client:
            node_info: dict[str, object] = {}
            for name in ("RMBG", "BiRefNetRMBG", "MaskToImage"):
                response = await client.get(
                    base_url + "/object_info/" + name, follow_redirects=False)
                if response.status_code == 404:
                    node_info[name] = None
                    continue
                response.raise_for_status()
                document = response.json()
                node_info[name] = document.get(name) if isinstance(document, dict) else None
            inventory = await client.get(
                base_url + "/models/rmbg", follow_redirects=False)
            inventory.raise_for_status()
            file_list = inventory.json()
            if not isinstance(file_list, list) or len(file_list) > 20000 or not all(
                    isinstance(item, str) and len(item) <= 512 for item in file_list):
                raise ValueError("Invalid RMBG inventory")
            available = {item.replace("\\", "/").casefold() for item in file_list}
            image_node = node_info["MaskToImage"]
            if not isinstance(image_node, dict) or not isinstance(
                    image_node.get("input"), dict) or not isinstance(
                    image_node["input"].get("required"), dict) or "mask" not in (
                        image_node["input"]["required"]):
                raise ValueError("ComfyUI has no compatible MaskToImage node")
            for entry, (_, spec) in zip(entries, models):
                try:
                    _validate_node(node_info[spec["class"]], spec)
                    needed = {
                        name.casefold() for name in spec["expected"]}
                    missing = sorted(needed - available)
                    if missing:
                        raise ValueError(
                            "Model files not registered under /models/rmbg: "
                            + ", ".join(missing[:4]))
                    entry["ready"] = True
                except ValueError as exc:
                    entry["reason"] = str(exc)[:350]
    except (httpx.HTTPError, ValueError) as exc:
        for entry in entries:
            entry["reason"] = str(exc)[:350]
    return {"modes": [{"mode": CHROMA, "model": None,
                       "node": None, "ready": True, "reason": ""}, *entries],
            "neural_available": any(item["ready"] for item in entries)}


def require_matting_mode(status: dict, mode: str) -> None:
    if mode == CHROMA:
        return
    if mode not in MODELS:
        raise HTTPException(422, "Invalid neural cutout mode")
    choice = next((x for x in status["modes"] if x["mode"] == mode), None)
    if choice is None or not choice["ready"]:
        raise HTTPException(
            422, "Neural cutout unavailable: " + (
                choice["reason"] if choice else "unknown model"))
