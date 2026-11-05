"""Hardware fit analysis for individual GGUF variants (no model execution).

Design adapted from the MIT-licensed Urakatsu model catalog:
https://github.com/karrot0/Urakatsu/blob/main/urakatsu/catalog/fit.py
Copyright (c) 2026 Urakatsu contributors; original MIT attribution retained
in docs/THIRD_PARTY_NOTICES.md.

The GGUF KV-cache estimate uses architecture metadata when available, otherwise
conservative fallback headroom. It is still an ESTIMATE: Flash Attention,
KV types, batch, backend and multimodal projectors can change actual usage.
"""
from __future__ import annotations

import re
import struct
from typing import Any

GIB = 1024 ** 3
_QUANT = re.compile(
    r"(?i)(?:^|[-_.])((?:UD-)?(?:I?Q[1-8](?:_[A-Z0-9]+)*|BF16|F16|F32|FP16|FP8|MXFP4(?:_MOE)?|NVFP4|TQ[12]_0))(?=\.gguf$)"
)
_SCALARS = {0:"<B",1:"<b",2:"<H",3:"<h",4:"<I",5:"<i",6:"<f",7:"<?",10:"<Q",11:"<q",12:"<d"}


def quantization(filename: str) -> str | None:
    found = _QUANT.search(filename.split("/")[-1])
    return found.group(1).upper().replace("FP16", "F16") if found else None


def gguf_metadata(buffer: bytes) -> dict[str, Any]:
    """Read bounded header only; never parse weights or large tokenizer arrays."""
    if len(buffer) < 24 or buffer[:4] != b"GGUF":
        return {}
    offset = 4
    result: dict[str, Any] = {}

    def scalar(fmt: str):
        nonlocal offset
        n = struct.calcsize(fmt)
        if n + offset > len(buffer):
            raise EOFError
        value = struct.unpack_from(fmt, buffer, offset)[0]
        offset += n
        return value

    def string() -> str:
        nonlocal offset
        n = scalar("<Q")
        if n > 4096 or offset + n > len(buffer):
            raise EOFError
        val = buffer[offset:offset + n].decode("utf8", errors="replace")
        offset += n
        return val

    def value(kind: int):
        if kind in _SCALARS:
            return scalar(_SCALARS[kind])
        if kind == 8:
            return string()
        if kind == 9:
            element, n = scalar("<I"), scalar("<Q")
            if n > 8192 or element not in _SCALARS:
                raise EOFError
            return [scalar(_SCALARS[element]) for _ in range(n)]
        raise EOFError

    try:
        version = scalar("<I")
        if not 2 <= version <= 4:
            return {}
        scalar("<Q")  # tensor count
        count = min(scalar("<Q"), 10000)
        for _ in range(count):
            key = string()
            if key.startswith("tokenizer."):
                break
            kind = scalar("<I")
            entry = value(kind)
            if key.startswith("general.") or any(
                x in key for x in (".block_count",".embedding_length",
                                  ".attention.",".context_length",
                                  ".full_attention_interval",".sliding_window")
            ):
                result[key] = entry
    except (EOFError, ValueError, OverflowError, struct.error):
        pass
    return result


def kv_cache_bytes(meta: dict, context: int) -> int | None:
    arch = meta.get("general.architecture")
    if not isinstance(arch, str):
        return None
    get = lambda name, default=None: meta.get(arch + "." + name, default)
    layers, embed = get("block_count"), get("embedding_length")
    heads = get("attention.head_count")
    kvheads = get("attention.head_count_kv", heads)
    if not all(isinstance(x, int) and x > 0 for x in [layers,embed,heads]):
        return None
    if isinstance(kvheads, int):
        kv_list = [kvheads] * layers
    elif isinstance(kvheads, list) and len(kvheads) >= layers:
        kv_list = kvheads
    else:
        return None
    head_dim = embed // heads
    key_dim = int(get("attention.key_length", head_dim) or head_dim)
    value_dim = int(get("attention.value_length", head_dim) or head_dim)
    if not 0 < layers <= 512 or not 0 < head_dim <= 512 or not 0 < key_dim <= 512:
        return None
    total = 0
    for value in kv_list[:layers]:
        if not isinstance(value, int) or not 0 < value <= 512:
            return None
        total += context * value * (key_dim + value_dim) * 2  # fp16 KV
    return total


def assess_variants(detail: dict, hardware: dict, context: int = 4096,
                    metadata: dict | None = None) -> dict:
    """Analyze one-file GGUF with measured capacity, never promise performance.

    full_gpu: estimate fits within *observed* free VRAM after system headroom.
    partial_offload: approximate additional RAM needed; not a guarantee.
    cpu: probable RAM only; too_large/unknown: no reliable fit.
    """
    meta = metadata or {}
    kv = kv_cache_bytes(meta, context)
    gpus = hardware.get("gpus") or []
    gpu = max(gpus, key=lambda v:v.get("vram_free_mb",0)) if gpus else None
    vram_total = int(gpu.get("vram_total_mb",0))*1024*1024 if gpu else 0
    vram_free = int(gpu.get("vram_free_mb",0))*1024*1024 if gpu else 0
    available_vram = max(0, min(vram_free, vram_total) - int(0.6 * GIB))
    ram_free = int(hardware.get("ram_available_mb",0))*1024*1024
    available_ram = max(0, int(ram_free * 0.8))
    free_disk = float(hardware.get("storage_free_gb",0))*GIB
    variants = []
    for variant in detail.get("variants", []):
        file_bytes = variant.get("size_bytes")
        quant = quantization(variant.get("filename",""))
        if not isinstance(file_bytes,int) or file_bytes <= 0:
            variants.append({"filename":variant.get("filename"),"quantization":quant,
                             "fit":"unknown","estimated_required_bytes":None,
                             "estimated_kv_bytes":kv,"gpu_share":0,
                             "disk_ok":None,"note":"No se conoce el tamaño del archivo."})
            continue
        # Additional workspace for runtime, compute, and unknown architectures.
        overhead = max(int(0.55 * GIB), int(file_bytes * 0.09))
        kv_budget = kv if kv is not None else max(int(0.7*GIB), int(file_bytes*0.12))
        required = file_bytes + overhead + kv_budget
        disk_ok = file_bytes * 1.03 < free_disk
        if gpu and required <= available_vram:
            fit = "full_gpu"
            share = 1.0
            note = "La estimación de pesos, KV y margen cabe en la VRAM libre observada."
        elif gpu and available_vram and required <= available_vram + available_ram:
            fit = "partial_offload"
            share = round(min(1.,available_vram/required),2)
            note = "Probable descarga parcial a RAM; depende del motor y puede ser lenta."
        elif required <= available_ram:
            fit = "cpu"
            share = 0
            note = "Probable ejecución con RAM/CPU; el rendimiento puede ser limitado."
        else:
            fit = "too_large"
            share = 0
            note = "La memoria disponible no parece suficiente para esta estimación."
        if not variant.get("supported",False):
            fit = "unsupported"
            note = "Esta variante no está admitida por el descargador actual."
        variants.append({
            "filename":variant["filename"],"quantization":quant,
            "fit":fit, "estimated_required_bytes":required,
            "estimated_kv_bytes":kv_budget,"gpu_share":share,
            "disk_ok":disk_ok,"note":note,
        })
    supported = [item for item in variants if item["fit"] in ("full_gpu","partial_offload","cpu")
                 and item["disk_ok"] is not False]
    rank = {"full_gpu":3,"partial_offload":2,"cpu":1}
    # Prefer the highest-quality *quantized* full GPU option, but avoid
    # recommending F16/BF16 when a well-fitting Q8 variant is available.
    supported.sort(key=lambda v:(rank[v["fit"]],
                 v["quantization"] not in ("F16","BF16","F32",None),
                 v["estimated_required_bytes"] or 0),reverse=True)
    recommendation = supported[0]["filename"] if supported else None
    return {
        "context_tokens":context,
        "gpu":gpu,
        "vram_usable_bytes":available_vram,
        "ram_usable_bytes":available_ram,
        "metadata_source":"gguf_header" if kv is not None else "fallback_estimate",
        "architecture":meta.get("general.architecture"),
        "parameter_count":meta.get("general.parameter_count"),
        "confidence":"measured_capacity_estimated_demand",
        "warning":"Estimación, no benchmark: contexto, backend, KV-cache, batch y otros procesos cambian la VRAM real.",
        "recommended_filename":recommendation,
        "variants":variants,
    }
