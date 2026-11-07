"""Bounded provenance for approved AI-generated Creator sprite assets."""
from __future__ import annotations

import math
import re

from .comfy_loras import LORA_FILENAME
from .comfy_identity_adapter import PRESETS
from .comfy_matting import MODELS

SHA = re.compile(r"[0-9a-f]{64}")


def normalize_sprite_generation(value: object) -> dict:
    if value is None or value == {}:
        return {}
    mandatory = {"workflow_version", "checkpoint", "seed", "prompt_sha256",
                 "lora", "quality"}
    if (not isinstance(value, dict) or
            not mandatory <= set(value) or
            set(value) - mandatory - {"adapter", "matting"}):
        raise ValueError("Invalid sprite provenance")
    adapter = value.get("adapter")
    matting = value.get("matting")
    version = value["workflow_version"]
    expected_version = (
        "comfy-sprite-v4-matting-ipadapter" if matting is not None and adapter is not None
        else "comfy-sprite-v3-matting" if matting is not None
        else "comfy-sprite-v2-ipadapter" if adapter is not None
        else "comfy-sprite-v1")
    if version != expected_version:
        raise ValueError("Invalid sprite generator version")
    if ("adapter" in value and adapter is None or
            "matting" in value and matting is None):
        raise ValueError("Empty adapter provenance")
    checkpoint, seed, digest = (value["checkpoint"], value["seed"],
                                value["prompt_sha256"])
    if (not isinstance(checkpoint, str) or not 1 <= len(checkpoint) <= 240 or
            any(ord(c) < 32 or ord(c) == 127 for c in checkpoint)):
        raise ValueError("Invalid sprite checkpoint")
    if type(seed) is not int or not 0 <= seed <= 2**53 - 1:
        raise ValueError("Invalid sprite seed")
    if not isinstance(digest, str) or not SHA.fullmatch(digest):
        raise ValueError("Invalid sprite prompt fingerprint")
    lora = value["lora"]
    if lora is not None:
        if not isinstance(lora, dict) or set(lora) != {
                "character_name", "lora_name", "strength"}:
            raise ValueError("Invalid sprite LoRA")
        name, filename, weight = (lora["character_name"], lora["lora_name"],
                                   lora["strength"])
        if not isinstance(name, str) or not 1 <= len(name) <= 80:
            raise ValueError("Invalid LoRA NPC name")
        if not isinstance(filename, str) or not LORA_FILENAME.fullmatch(filename):
            raise ValueError("Invalid sprite LoRA filename")
        if (isinstance(weight, bool) or not isinstance(weight, (float, int))
                or not math.isfinite(weight) or not 0 < weight <= 2):
            raise ValueError("Intensidad de Invalid sprite LoRA")
        lora = {"character_name": name, "lora_name": filename, "strength": float(weight)}
    quality = value["quality"]
    if not isinstance(quality, dict) or set(quality) != {
            "method", "coverage", "requires_author_review", "author_approved"}:
        raise ValueError("Invalid cutout metadata")
    coverage = quality["coverage"]
    if (quality["method"] not in {
            "alpha_original", "border_chroma_key",
            "neural_rmbg", "neural_birefnet"}
            or isinstance(coverage, bool) or not isinstance(coverage, (int, float))
            or not math.isfinite(coverage) or not 0.04 <= coverage <= 0.82
            or quality["requires_author_review"] is not True
            or quality["author_approved"] is not True):
        raise ValueError("Invalid sprite quality/approval")
    if adapter is not None:
        if not isinstance(adapter, dict) or set(adapter) != {
                "preset", "weight", "reference_sha256", "reference_kind"}:
            raise ValueError("Invalid IPAdapter configuration")
        preset, weight = adapter["preset"], adapter["weight"]
        ref_digest, kind = adapter["reference_sha256"], adapter["reference_kind"]
        if (preset not in PRESETS or isinstance(weight, bool) or
                not isinstance(weight, (float, int)) or
                not math.isfinite(weight) or not 0.1 <= weight <= 1.5 or
                not isinstance(ref_digest, str) or not SHA.fullmatch(ref_digest) or
                kind not in ("gallery", "sprite")):
            raise ValueError("Invalid provenance IPAdapter")
        adapter = {"preset": preset, "weight": float(weight),
                   "reference_sha256": ref_digest, "reference_kind": kind}
    if matting is not None:
        if (not isinstance(matting, dict) or set(matting) != {"mode", "model"}
                or not isinstance(matting["mode"], str)
                or matting["mode"] not in MODELS
                or matting["model"] != MODELS[matting["mode"]]["model"]
                or quality["method"] != MODELS[matting["mode"]]["method"]):
            raise ValueError("Incompatible neural cutout provenance")
        matting = dict(matting)
    elif quality["method"] in {"neural_rmbg", "neural_birefnet"}:
        raise ValueError("Neural sprite is missing its provenance model")
    result = {"workflow_version": version, "checkpoint": checkpoint,
              "seed": seed, "prompt_sha256": digest, "lora": lora,
              "quality": {"method": quality["method"], "coverage": float(coverage),
                          "requires_author_review": True, "author_approved": True}}
    if adapter is not None:
        result["adapter"] = adapter
    if matting is not None:
        result["matting"] = matting
    return result
