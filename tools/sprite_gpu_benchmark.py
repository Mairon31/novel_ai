"""Physical, opt-in Noble AI sprite benchmark. Never runs in CI.

Run against Noble's already running loopback API and installed local ComfyUI.
Creates resumable *unapproved* sprite drafts, never edits existing published art,
and writes per-expression PNG, report.json, review.html and review.csv locally.

Example (from repository root):
  python tools/sprite_gpu_benchmark.py --story-id UUID --character-id UUID \
    --modes chroma_green,neural_rmbg2,neural_birefnet_portrait \
    --seed 1407 --out sprite-benchmark

No prompts, API tokens or NPC names are written to the report. Actual GPU
metrics are measured via nvidia-smi when available, otherwise left null.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timezone
import html
import io
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.parse import urlsplit
import uuid

import httpx
from PIL import Image, UnidentifiedImageError

MODES = (
    "chroma_green", "neural_rmbg2", "neural_birefnet_portrait",
    "neural_birefnet_matting",
)
EXPRESSIONS = ("neutral", "joy", "anger", "sadness", "surprise")
MAX_IMAGE_BYTES = 12 * 1024 * 1024
DEFAULT_API = "http://127.0.0.1:8000"
MAX_TIMEOUT = 900


def loopback_base(url: str) -> str:
    parsed = urlsplit(url)
    if (parsed.scheme != "http" or parsed.hostname not in
            ("127.0.0.1", "localhost", "::1") or
            parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise ValueError("La URL de Noble debe ser HTTP loopback sin ruta/credenciales")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Puerto de Noble inválido") from exc
    if port is None or not 1 <= port <= 65535:
        raise ValueError("Especifica el puerto local de la API Noble")
    return url.rstrip("/")


def canonical_uuid(value: str) -> str:
    try:
        normalized = str(uuid.UUID(value))
    except ValueError as exc:
        raise ValueError("Identificador UUID inválido") from exc
    if normalized != value:
        raise ValueError("UUID debe estar en formato canónico")
    return normalized


def comma_list(value: str, allowed: tuple[str, ...]) -> tuple[str, ...]:
    names = tuple(s.strip() for s in value.split(","))
    if (not names or any(s not in allowed for s in names)
            or len(set(names)) != len(names)):
        raise ValueError("Lista inválida o con duplicados: " + value[:120])
    return names


def quantile(measurements: list[float], p: float) -> float | None:
    if not measurements:
        return None
    sorted_values = sorted(measurements)
    pos = (len(sorted_values) - 1) * p
    low, high = int(math.floor(pos)), int(math.ceil(pos))
    return round(sorted_values[low] + (sorted_values[high] -
                                       sorted_values[low]) * (pos - low), 2)


def image_metrics(content: bytes) -> dict:
    """Quantitative transparency properties, not facial similarity or aesthetics."""
    if not 0 < len(content) <= MAX_IMAGE_BYTES:
        raise ValueError("Vista previa demasiado grande o vacía")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != "PNG" or image.mode != "RGBA" or (
                    image.width * image.height > 20_000_000):
                raise ValueError("La vista previa no es PNG RGBA válido")
            image.load()
            width, height = image.size
            alpha = image.getchannel("A")
            bins = alpha.histogram()
            left, top, right, bottom = alpha.point(
                lambda a: 255 if a >= 128 else 0).getbbox() or (0, 0, 0, 0)
            edges = [alpha.getpixel((x, 0)) for x in range(width)]
            edges += [alpha.getpixel((x, height - 1)) for x in range(width)]
            edges += [alpha.getpixel((0, y)) for y in range(height)]
            edges += [alpha.getpixel((width - 1, y)) for y in range(height)]
    except (OSError, Image.DecompressionBombError, UnidentifiedImageError) as exc:
        raise ValueError("No se puede analizar la vista previa") from exc
    total = width * height
    return {
        "width": width, "height": height,
        "opaque_coverage": round(sum(bins[192:]) / total, 5),
        "soft_alpha_fraction": round(sum(bins[1:255]) / total, 5),
        "transparent_fraction": round(bins[0] / total, 5),
        "border_opaque_fraction": round(
            sum(value > 32 for value in edges) / len(edges), 5),
        "silhouette_bbox_normalized": [
            round(left / width, 5), round(top / height, 5),
            round(right / width, 5), round(bottom / height, 5)],
    }


def nvidia_snapshot(gpu_index: int) -> dict | None:
    """Sample *host* NVIDIA driver, not guaranteed to be ComfyUI's device."""
    binary = shutil.which("nvidia-smi")
    if not binary:
        return None
    try:
        process = subprocess.run(
            [binary, "--query-gpu=index,name,memory.total,memory.used,utilization.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=4, check=False)
        if process.returncode:
            return None
        for row in csv.reader(io.StringIO(process.stdout)):
            if len(row) != 5:
                continue
            index = int(row[0].strip())
            if index == gpu_index:
                total, used, utilization = (int(row[2].strip()),
                                            int(row[3].strip()),
                                            int(row[4].strip()))
                if total < 0 or used < 0 or not 0 <= utilization <= 100:
                    return None
                return {
                    "index": index, "name": row[1].strip(),
                    "total_mb": total, "used_mb": used,
                    "utilization_percent": utilization,
                }
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return None


async def watch_gpu(stop: asyncio.Event, result: list[dict], gpu_index: int,
                    period: float = 0.4, probe=None) -> None:
    probe = probe or nvidia_snapshot
    while True:
        try:
            record = await asyncio.to_thread(probe, gpu_index)
            if isinstance(record, dict):
                result.append(record)
        except (OSError, ValueError):
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=period)
            break
        except asyncio.TimeoutError:
            pass


def sample_summary(samples: list[dict]) -> dict:
    return {
        "samples": len(samples),
        "device": samples[0].get("name") if samples else None,
        "total_mb": samples[0].get("total_mb") if samples else None,
        "peak_used_mb": max(x["used_mb"] for x in samples) if samples else None,
        "peak_util_percent": max(x["utilization_percent"] for x in samples)
        if samples else None,
    }


async def get_json(client: httpx.AsyncClient, url: str) -> dict:
    response = await client.get(url, follow_redirects=False)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("La API devolvió un JSON inesperado")
    return payload


def safe_error(exc: Exception) -> str:
    """Keep exception class and HTTP status; never write private request URLs."""
    if isinstance(exc, httpx.HTTPStatusError):
        return "HTTP " + str(exc.response.status_code)
    return type(exc).__name__ + ": " + str(exc)[:110] if isinstance(
        exc, ValueError) else type(exc).__name__


def store_json(report: dict, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / "report.json.tmp"
    temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                         encoding="utf-8")
    temporary.replace(directory / "report.json")


def write_review(report: dict, directory: Path) -> None:
    """Static, offline HTML and empty CSV for author hair/face/outfit inspection."""
    styles = """
    body{font:15px/1.5 system-ui, sans-serif;background:#101421;color:#e9ebf1;
         max-width:1300px;margin:20px auto;padding:12px}
    h1,h2{line-height:1.2}.grid{display:grid;grid-template-columns:
         repeat(auto-fit,minmax(190px,1fr));gap:16px}
    article{border:1px solid #344057;border-radius:12px;background:#1d2535;padding:12px}
    img{width:100%;height:300px;object-fit:contain;background:
         repeating-conic-gradient(#334052 0 25%,#1e293a 0 50%) 50%/20px 20px}
    small{color:#bec8d8}label{display:block}input[type=checkbox]{width:20px;height:20px}
    """
    chunks = [
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Noble AI - revisión de sprites</title><style>' + styles +
        '</style></head><body><h1>Noble AI · revisión de sprites</h1>',
        '<p>Comparación local. Las máscaras y métricas no verifican identidad '
        'facial, anatomía ni calidad artística. No hay aprobación automática.</p>',
    ]
    csv_rows = []
    for mode in report["modes"]:
        chunks.append("<h2>" + html.escape(mode["mode"]) + "</h2><div class=grid>")
        for entry in mode["expressions"]:
            expression = entry["expression"]
            if entry["status"] != "success":
                chunks.append("<article><strong>" + html.escape(expression) +
                              "</strong><p>No disponible</p></article>")
                continue
            filename = entry["preview_file"]
            chunks.append(
                "<article><strong>" + html.escape(expression) + "</strong>"
                '<img loading="lazy" alt="' + html.escape(expression) +
                '" src="' + html.escape(filename, quote=True) +
                '"><p><small>' + str(entry["duration_ms"]) + " ms · alfa suave: " +
                str(entry["image_metrics"]["soft_alpha_fraction"]) +
                "</small></p><label><input type=checkbox> Revisé rostro, "
                "ropa, cabello y bordes</label></article>"
            )
            csv_rows.append({
                "mode": mode["mode"], "expression": expression,
                "hair_edges_ok": "", "face_consistent": "",
                "outfit_consistent": "", "notes": "",
            })
        chunks.append("</div>")
    chunks.append("</body></html>")
    (directory / "review.html").write_text(
        "\n".join(chunks), encoding="utf-8")
    with (directory / "review.csv").open(
            "w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=(
            "mode", "expression", "hair_edges_ok", "face_consistent",
            "outfit_consistent", "notes"))
        writer.writeheader()
        writer.writerows(csv_rows)


async def benchmark(*, base: str, story_id: str, character_id: str,
                    modes: tuple[str, ...], expressions: tuple[str, ...],
                    seed: int, directory: Path, timeout: int = 360,
                    gpu_index: int = 0, monitor_period: float = 0.4,
                    check_only: bool = False, use_lora: bool = False,
                    reference_asset_id: str | None = None,
                    reference_sprite_asset_id: str | None = None,
                    reference_mode: str = "img2img",
                    ipadapter_preset: str = "PLUS FACE (portraits)",
                    ipadapter_weight: float = 0.7,
                    allow_low_vram: bool = False,
                    transport: httpx.AsyncBaseTransport | None = None,
                    gpu_probe=None, progress=print) -> dict:
    """Run explicit real API operations, never approve/publish generated sprites."""
    base = loopback_base(base)
    story_id, character_id = canonical_uuid(story_id), canonical_uuid(character_id)
    if not modes or any(x not in MODES for x in modes) or len(set(modes)) != len(modes):
        raise ValueError("Modos de benchmark inválidos")
    if not expressions or any(x not in EXPRESSIONS for x in expressions) or (
            len(set(expressions)) != len(expressions)):
        raise ValueError("Expresiones de benchmark inválidas")
    if not 0 <= seed <= 2**53 - 1 or not 10 <= timeout <= MAX_TIMEOUT:
        raise ValueError("Semilla o timeout fuera de rango")
    if reference_asset_id and reference_sprite_asset_id:
        raise ValueError("No se pueden mezclar referencias de Galería y sprites")
    if reference_mode not in ("img2img", "ipadapter"):
        raise ValueError("Modo de referencia no admitido")
    if reference_mode == "ipadapter" and not (
            reference_asset_id or reference_sprite_asset_id):
        raise ValueError("IPAdapter exige una referencia")
    if reference_asset_id:
        canonical_uuid(reference_asset_id)
    if reference_sprite_asset_id:
        canonical_uuid(reference_sprite_asset_id)
    if not directory.exists():
        directory.mkdir(parents=True)
    directory = directory.resolve()
    report = {
        "schema": 1, "tool": "Noble AI physical sprite benchmark",
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "source": "local_api", "simulated": transport is not None,
        "seed": seed, "expressions_requested": list(expressions),
        "modes_requested": list(modes), "api_endpoint_type": "loopback",
        "preflight": {}, "modes": [],
        "quality_notice": ("Transparency coverage and silhouette bounds do not "
                           "measure facial identity or human visual quality."),
        "gpu_notice": ("nvidia-smi samples host GPU memory; sample peaks may miss "
                       "short spikes and can include other processes."),
    }
    async with httpx.AsyncClient(
            trust_env=False, transport=transport,
            timeout=httpx.Timeout(timeout, connect=15)) as client:
        config = await get_json(client, base + "/api/v1/images/config")
        status = await get_json(client, base + "/api/v1/images/status")
        matte = await get_json(client, base + "/api/v1/images/matting/status")
        checkpoint = config.get("checkpoint")
        if not isinstance(checkpoint, str) or not checkpoint:
            raise ValueError("Configura primero un checkpoint en Noble AI")
        if not status.get("online") or checkpoint not in status.get("checkpoints", []):
            raise ValueError("El checkpoint seleccionado no está disponible en ComfyUI")
        report["preflight"] = {
            "checkpoint": checkpoint,
            "resolution": [config.get("width"), config.get("height")],
            "steps": config.get("steps"), "cfg": config.get("cfg"),
            "matting_modes": {
                item.get("mode"): {"ready": bool(item.get("ready")),
                                   "reason": item.get("reason") or ""}
                for item in matte.get("modes", []) if isinstance(item, dict)
            },
        }
        if reference_mode == "ipadapter":
            adapter = await get_json(
                client, base + "/api/v1/images/identity-adapter/status")
            report["preflight"]["ipadapter"] = {
                "available": bool(adapter.get("available")),
                "preset_ready": ipadapter_preset in adapter.get("presets", []),
            }
        store_json(report, directory)
        if check_only:
            progress("Preflight completado: modo consulta, no se generó ninguna imagen.")
            return report
        for mode in modes:
            mode_record = {"mode": mode, "status": "pending",
                           "draft_created": False, "expressions": [],
                           "latency_p50_ms": None, "latency_p95_ms": None}
            report["modes"].append(mode_record)
            ready = report["preflight"]["matting_modes"].get(mode) or {}
            if mode != "chroma_green" and not ready.get("ready"):
                mode_record["status"] = "skipped"
                mode_record["error"] = "Modelo/nodo no disponible según preflight"
                progress("OMITIDO " + mode + ": falta el modelo o el nodo")
                store_json(report, directory)
                continue
            if reference_mode == "ipadapter" and not (
                    report["preflight"]["ipadapter"]["available"] and
                    report["preflight"]["ipadapter"]["preset_ready"]):
                mode_record["status"] = "skipped"
                mode_record["error"] = "IPAdapter no disponible"
                store_json(report, directory)
                continue
            try:
                created = await client.post(
                    base + f"/api/v1/stories/{story_id}/creator/characters/"
                           f"{character_id}/sprite-drafts",
                    json={
                        "caption": "Benchmark técnico de sprites sin publicar",
                        "pose": "standing",
                        "style": "clean anime full-body character concept art",
                        "seed": seed, "cutout_mode": mode, "use_lora": use_lora,
                        "reference_asset_id": reference_asset_id,
                        "reference_sprite_asset_id": reference_sprite_asset_id,
                        "reference_mode": reference_mode,
                        "ipadapter_preset": ipadapter_preset,
                        "ipadapter_weight": ipadapter_weight,
                    }, follow_redirects=False)
                created.raise_for_status()
                draft = created.json()
                draft_id = canonical_uuid(draft["id"])
                mode_record["draft_created"] = True
                # Draft remains in the local Noble DB for manual inspection.
                progress(f"Borrador creado para {mode}; sin publicación.")
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                mode_record["status"] = "failed"
                mode_record["error"] = safe_error(exc)
                store_json(report, directory)
                continue
            for expression in expressions:
                progress(f"GENERANDO [{mode}] {expression} ...")
                stop, samples = asyncio.Event(), []
                observer = asyncio.create_task(
                    watch_gpu(stop, samples, gpu_index, monitor_period, gpu_probe))
                started = time.perf_counter()
                entry = {"expression": expression, "status": "failed",
                         "duration_ms": None, "gpu": None}
                try:
                    response = await client.post(
                        base + f"/api/v1/stories/{story_id}/creator/sprite-drafts/"
                               f"{draft_id}/expressions/{expression}",
                        json={"allow_low_vram": allow_low_vram},
                        follow_redirects=False)
                    response.raise_for_status()
                    data = response.json()
                    slot = (data.get("slots") or {}).get(expression) or {}
                    if not slot.get("ready"):
                        raise ValueError("La API no confirmó la expresión generada")
                    preview = await client.get(
                        base + f"/api/v1/stories/{story_id}/creator/sprite-drafts/"
                               f"{draft_id}/expressions/{expression}/preview",
                        follow_redirects=False)
                    preview.raise_for_status()
                    observed = image_metrics(preview.content)
                    filename = mode + "-" + expression + ".png"
                    target = directory / filename
                    temporary = target.with_suffix(".png.part")
                    try:
                        temporary.write_bytes(preview.content)
                        temporary.replace(target)
                    finally:
                        temporary.unlink(missing_ok=True)
                    entry.update({
                        "status": "success", "preview_file": filename,
                        "image_metrics": observed,
                        "server_cutout": slot.get("quality"),
                    })
                except (httpx.HTTPError, ValueError, KeyError,
                        OSError, TypeError) as exc:
                    entry["error"] = safe_error(exc)
                finally:
                    entry["duration_ms"] = round(
                        (time.perf_counter() - started) * 1000, 2)
                    stop.set()
                    await observer
                    entry["gpu"] = sample_summary(samples)
                    mode_record["expressions"].append(entry)
                    store_json(report, directory)
                progress(f"  {expression}: {entry['status']} · "
                         f"{entry['duration_ms']} ms · GPU samples "
                         f"{entry['gpu']['samples']}")
                if entry["status"] != "success":
                    break  # Prevent repeated expensive runs after one failure.
            valid = [item["duration_ms"] for item in mode_record["expressions"]
                     if item["status"] == "success"]
            count = len(valid)
            mode_record["status"] = ("success" if count == len(expressions)
                                     else "partial" if count else "failed")
            mode_record["latency_p50_ms"] = quantile(valid, .5)
            mode_record["latency_p95_ms"] = quantile(valid, .95)
            store_json(report, directory)
    report["finished_utc"] = datetime.now(timezone.utc).isoformat()
    report["review_required"] = True
    store_json(report, directory)
    write_review(report, directory)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark GPU local de sprites IA sin aprobar ni publicar arte")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--character-id", required=True)
    parser.add_argument("--modes", default="chroma_green,neural_birefnet_portrait")
    parser.add_argument("--expressions", default=",".join(EXPRESSIONS))
    parser.add_argument("--seed", type=int, default=1407)
    parser.add_argument("--out", type=Path, default=Path("sprite-benchmark"))
    parser.add_argument("--timeout", type=int, default=360)
    parser.add_argument("--gpu-index", type=int, default=0)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--use-lora", action="store_true")
    parser.add_argument("--reference-asset-id")
    parser.add_argument("--reference-sprite-asset-id")
    parser.add_argument("--reference-mode", choices=("img2img", "ipadapter"),
                        default="img2img")
    parser.add_argument("--ipadapter-preset", default="PLUS FACE (portraits)")
    parser.add_argument("--ipadapter-weight", type=float, default=0.7)
    parser.add_argument("--allow-low-vram", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = asyncio.run(benchmark(
            base=args.api, story_id=args.story_id,
            character_id=args.character_id,
            modes=comma_list(args.modes, MODES),
            expressions=comma_list(args.expressions, EXPRESSIONS),
            seed=args.seed, directory=args.out, timeout=args.timeout,
            gpu_index=args.gpu_index, check_only=args.check_only,
            use_lora=args.use_lora,
            reference_asset_id=args.reference_asset_id,
            reference_sprite_asset_id=args.reference_sprite_asset_id,
            reference_mode=args.reference_mode,
            ipadapter_preset=args.ipadapter_preset,
            ipadapter_weight=args.ipadapter_weight,
            allow_low_vram=args.allow_low_vram,
        ))
    except (ValueError, httpx.HTTPError, OSError) as exc:
        print("No se pudo ejecutar el benchmark: " + safe_error(exc),
              file=sys.stderr)
        return 2
    print("Informe JSON: " + str(args.out / "report.json"))
    if not args.check_only:
        print("Revisión HTML: " + str(args.out / "review.html"))
        print("Planilla de revisión: " + str(args.out / "review.csv"))
    return 1 if any(x["status"] not in ("success",) for x in result["modes"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
