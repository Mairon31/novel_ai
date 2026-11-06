"""Bounded provenance for approved AI-generated Creator sprite assets."""
from __future__ import annotations

import math
import re

from .comfy_loras import LORA_FILENAME
from .comfy_identity_adapter import PRESETS

SHA = re.compile(r"[0-9a-f]{64}")


def normalize_sprite_generation(value: object) -> dict:
    if value is None or value == {}:
        return {}
    mandatory = {"workflow_version", "checkpoint", "seed", "prompt_sha256",
                 "lora", "quality"}
    if (not isinstance(value, dict) or
            not mandatory <= set(value) or set(value) - mandatory - {"adapter"}):
        raise ValueError("Procedencia de sprite inválida")
    adapter = value.get("adapter")
    version = value["workflow_version"]
    if version != ("comfy-sprite-v2-ipadapter" if adapter is not None
                   else "comfy-sprite-v1"):
        raise ValueError("Versión de generador de sprites inválida")
    if "adapter" in value and adapter is None:
        raise ValueError("Referencia IPAdapter vacía")
    checkpoint, seed, digest = (value["checkpoint"], value["seed"],
                                value["prompt_sha256"])
    if (not isinstance(checkpoint, str) or not 1 <= len(checkpoint) <= 240 or
            any(ord(c) < 32 or ord(c) == 127 for c in checkpoint)):
        raise ValueError("Checkpoint de sprite inválido")
    if type(seed) is not int or not 0 <= seed <= 2**53 - 1:
        raise ValueError("Semilla de sprite inválida")
    if not isinstance(digest, str) or not SHA.fullmatch(digest):
        raise ValueError("Huella de prompt de sprite inválida")
    lora = value["lora"]
    if lora is not None:
        if not isinstance(lora, dict) or set(lora) != {
                "character_name", "lora_name", "strength"}:
            raise ValueError("LoRA de sprite inválida")
        name, filename, weight = (lora["character_name"], lora["lora_name"],
                                   lora["strength"])
        if not isinstance(name, str) or not 1 <= len(name) <= 80:
            raise ValueError("Nombre de NPC LoRA inválido")
        if not isinstance(filename, str) or not LORA_FILENAME.fullmatch(filename):
            raise ValueError("Archivo de LoRA de sprite inválido")
        if (isinstance(weight, bool) or not isinstance(weight, (float, int))
                or not math.isfinite(weight) or not 0 < weight <= 2):
            raise ValueError("Intensidad de LoRA de sprite inválida")
        lora = {"character_name": name, "lora_name": filename, "strength": float(weight)}
    quality = value["quality"]
    if not isinstance(quality, dict) or set(quality) != {
            "method", "coverage", "requires_author_review", "author_approved"}:
        raise ValueError("Metadatos de recorte inválidos")
    coverage = quality["coverage"]
    if (quality["method"] not in {"alpha_original", "border_chroma_key"}
            or isinstance(coverage, bool) or not isinstance(coverage, (int, float))
            or not math.isfinite(coverage) or not 0.04 <= coverage <= 0.82
            or quality["requires_author_review"] is not True
            or quality["author_approved"] is not True):
        raise ValueError("Calidad/aprobación de sprite inválida")
    if adapter is not None:
        if not isinstance(adapter, dict) or set(adapter) != {
                "preset", "weight", "reference_sha256", "reference_kind"}:
            raise ValueError("Configuración IPAdapter no válida")
        preset, weight = adapter["preset"], adapter["weight"]
        ref_digest, kind = adapter["reference_sha256"], adapter["reference_kind"]
        if (preset not in PRESETS or isinstance(weight, bool) or
                not isinstance(weight, (float, int)) or
                not math.isfinite(weight) or not 0.1 <= weight <= 1.5 or
                not isinstance(ref_digest, str) or not SHA.fullmatch(ref_digest) or
                kind not in ("gallery", "sprite")):
            raise ValueError("IPAdapter de procedencia inválido")
        adapter = {"preset": preset, "weight": float(weight),
                   "reference_sha256": ref_digest, "reference_kind": kind}
    result = {"workflow_version": version, "checkpoint": checkpoint,
              "seed": seed, "prompt_sha256": digest, "lora": lora,
              "quality": {"method": quality["method"], "coverage": float(coverage),
                          "requires_author_review": True, "author_approved": True}}
    if adapter is not None:
        result["adapter"] = adapter
    return result
