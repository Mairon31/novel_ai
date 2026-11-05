"""Model storage inventory inspired by Urakatsu's MIT ModelsStorage patterns.

Only verified paths in Noble's model root are counted. We do not recursively
scan unrelated directories, change paths, or remove files.
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path

from .store import Store


def _safe_size(root: Path, file: Path) -> int:
    """Do not count symlinks or paths outside the owned directory."""
    try:
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            return 0
        if not file.is_file():
            return 0
        return file.stat().st_size
    except (OSError, ValueError):
        return 0


def inspect_model_storage(store: Store) -> dict:
    root = store.models_dir.resolve()
    disk = shutil.disk_usage(root)
    installed = store.installed()
    downloads = store.downloads()
    items: list[dict] = []
    registered_bytes = 0
    partial_bytes = 0
    installed_paths: set[Path] = set()
    partial_paths: set[Path] = set()

    for model in installed:
        file = Path(model["filepath"])
        resolved = file.resolve()
        if resolved in installed_paths:
            continue
        installed_paths.add(resolved)
        actual = _safe_size(root, file)
        registered_bytes += actual
        items.append({
            "id": model["id"], "name": model["filename"], "kind": "installed",
            "size_bytes": actual, "file_present": actual > 0,
            "repo_id": model["repo_id"],
        })

    # A resumable .part is not yet installed. Use real file sizes and avoid
    # adding the same partial file twice if multiple jobs share a path.
    for job in downloads:
        if job["status"] == "completed":
            continue
        file = root / "hf" / job["repo_id"] / job["revision"] / (job["filename"] + ".part")
        resolved = file.resolve()
        if resolved in partial_paths:
            continue
        partial_paths.add(resolved)
        actual = _safe_size(root, file)
        if actual <= 0:
            continue
        partial_bytes += actual
        items.append({
            "id": job["id"], "name": job["filename"], "kind": "partial",
            "size_bytes": actual, "file_present": True,
            "repo_id": job["repo_id"],
        })

    return {
        "models_dir": str(root),
        "disk": {
            "total_bytes": disk.total,
            "used_bytes": disk.used,
            "free_bytes": disk.free,
        },
        "installed": {"count": len(installed), "bytes": registered_bytes},
        "partial": {
            "count": sum(item["kind"] == "partial" for item in items),
            "bytes": partial_bytes,
        },
        "items": sorted(items, key=lambda item: item["size_bytes"], reverse=True)[:100],
        "observed_at": time.time(),
        "scope": "registered_and_partial_files_only",
    }
