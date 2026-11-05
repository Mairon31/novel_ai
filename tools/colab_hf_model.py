"""Resolve and download a real Hugging Face GGUF for Colab QA.

The earlier notebook hardcoded a non-existent filename and received HTTP 404.
This tool checks actual repository files FIRST and pins the exact revision.
It accepts an unambiguous prefix variation of the requested quantization,
never silently changing Q4_K_M to another precision.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


_QUANT = re.compile(r"-(?P<quant>(?:IQ|Q)\d+_[A-Z0-9_]+)\.gguf$", re.I)


def select_gguf_file(files: list[str], requested: str) -> str:
    available = sorted(name for name in files if name.lower().endswith(".gguf"))
    if requested in available:
        return requested
    quant = _QUANT.search(requested)
    if quant:
        tag = "-" + quant.group("quant").lower() + ".gguf"
        candidates = [name for name in available if name.lower().endswith(tag)]
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise ValueError(
                f"Hay {len(candidates)} archivos con cuantización {quant.group('quant')}; "
                "selecciona el nombre completo: " + ", ".join(candidates[:10]))
    raise FileNotFoundError(
        f"El archivo solicitado {requested!r} no existe o su cuantización no está "
        "disponible. Archivos GGUF del repositorio: " +
        (", ".join(available[:40]) if available else "(ninguno)"))


def fetch_model(repo: str, requested: str, folder: str, output_json: str) -> dict:
    from huggingface_hub import HfApi, hf_hub_download

    api = HfApi()
    print(f"[HF] Consultando archivos reales de {repo}...", flush=True)
    record = api.model_info(repo, files_metadata=False)
    revision = record.sha
    if not revision:
        raise ValueError("Hugging Face no devolvió una revisión de modelo")
    listing = [entry.rfilename for entry in (record.siblings or [])
               if getattr(entry, "rfilename", None)]
    if not listing:
        listing = api.list_repo_files(repo, revision=revision)
    print(f"[HF] Revisión {revision}, archivos publicados: {len(listing)}", flush=True)

    filename = select_gguf_file(listing, requested)
    if filename != requested:
        print(f"[HF] Nombre solicitado no encontrado; mismo quant disponible: {filename}",
              flush=True)
    print(f"[HF] Descargando archivo verificado en catálogo: {filename}", flush=True)
    model = Path(hf_hub_download(
        repo_id=repo, filename=filename, revision=revision, local_dir=folder))
    if not model.is_file() or model.stat().st_size < 1024 * 1024:
        raise ValueError("El archivo GGUF descargado está ausente o es demasiado pequeño")

    print(f"[HF] Descarga completa: {model.stat().st_size / 1048576:.1f} MiB", flush=True)
    digest = hashlib.sha256()
    with model.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    metadata = {
        "repo": repo, "requested_filename": requested, "filename": filename,
        "revision": revision, "size_mb": round(model.stat().st_size / 1048576, 2),
        "sha256": digest.hexdigest(), "path": str(model),
    }
    target = Path(output_json)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    temporary.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    temporary.replace(target)
    print(f"[HF] SHA256 del modelo: {metadata['sha256']}", flush=True)
    print(f"[HF] Metadatos: {target}", flush=True)
    return metadata


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit("Uso: colab_hf_model.py REPO ARCHIVO_GGUF DIRECTORIO METADATOS_JSON")
    fetch_model(*sys.argv[1:])


if __name__ == "__main__":
    main()
