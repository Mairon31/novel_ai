"""Bounded, interoperable metadata for gallery render provenance."""
from __future__ import annotations

import json
import math
import re

_MODEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,146}\.safetensors")


def normalized_render_details(value: dict | str | None) -> dict:
    if value is None:
        return {}
    if isinstance(value, str):
        if len(value) > 4096:
            raise ValueError("Image metadata is too large")
        try:
            value = json.loads(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Image metadata is not valid JSON") from exc
    if not isinstance(value, dict) or set(value) - {
            "workflow_version", "loras", "sampler_name", "scheduler", "style_preset"}:
        raise ValueError("Invalid visual provenance fields")
    if not value:
        return {}
    version = value.get("workflow_version")
    if not isinstance(version, str) or len(version) > 80:
        raise ValueError("Invalid workflow version")
    loras = value.get("loras", [])
    if not isinstance(loras, list) or len(loras) > 3:
        raise ValueError("Demasiados LoRAs en la procedencia visual")
    clean = []
    for row in loras:
        if not isinstance(row, dict) or set(row) != {
            "character_name", "lora_name", "strength",
        }:
            raise ValueError("Invalid provenance LoRA entry")
        name, filename, strength = (
            row["character_name"], row["lora_name"], row["strength"])
        if not isinstance(name, str) or not 1 <= len(name) <= 80:
            raise ValueError("Invalid provenance character name")
        if not isinstance(filename, str) or not _MODEL.fullmatch(filename):
            raise ValueError("Invalid provenance LoRA file")
        if (isinstance(strength, bool) or not isinstance(strength, (float, int))
                or not math.isfinite(strength) or not 0 < strength <= 2):
            raise ValueError("Invalid provenance LoRA weight")
        clean.append({"character_name": name, "lora_name": filename,
                      "strength": float(strength)})
    result = {"workflow_version": version, "loras": clean}
    # Older gallery archives have no sampling metadata; retain their exact
    # shape rather than fabricating settings. New records preserve real inputs.
    for field, allowed in (
        ("sampler_name", {"euler", "euler_ancestral", "dpmpp_2m", "dpmpp_sde",
                          "dpmpp_2m_sde", "heun", "uni_pc"}),
        ("scheduler", {"normal", "karras", "exponential", "sgm_uniform", "simple"}),
        ("style_preset", {"anime_fantasy", "anime_cinematic", "anime_watercolor",
                          "none"}),
    ):
        if field in value:
            selected = value[field]
            if not isinstance(selected, str) or selected not in allowed:
                raise ValueError("Invalid visual provenance field: " + field)
            result[field] = selected
    return result
