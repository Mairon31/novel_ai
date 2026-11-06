"""Portable versioned Noble story-family backup with transactional restoration.

The file format keeps original UUIDs and preserves all branch relationships,
author blueprints, lorebooks, historical snapshots and managed media. Import
never overwrites an existing story, never extracts an archive path verbatim, and
uses the same durable staging/recovery protocol as narrative forks.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import uuid
import zipfile

from fastapi import File, HTTPException, UploadFile
from fastapi.responses import Response

FORMAT = "noble-story-family"
VERSION = 1
MAX_STORIES = 64
MAX_ROWS = 25000
MAX_FILES = 1200
MAX_DATA_BYTES = 192 * 1024 * 1024
MAX_MANIFEST_BYTES = 24 * 1024 * 1024
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_UPLOAD_BYTES = MAX_DATA_BYTES + MAX_MANIFEST_BYTES + 10 * 1024 * 1024
UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
MEDIA_PATH = re.compile(
    r"story-assets/([0-9a-f-]{36})/"
    r"(scene\.webp|images/[0-9a-f-]{36}\.webp|creator/[0-9a-f-]{36}\.(?:webp|png))"
)
TABLES = (
    "stories", "story_turns", "visual_scenes", "visual_assets",
    "visual_current", "visual_characters", "scene_plans",
    "creator_blueprints", "creator_characters", "creator_media_assets",
    "lorebook_entries", "world_states", "world_state_edits",
    "visual_turn_snapshots", "creator_turn_snapshots",
    "creator_media_turn_snapshots", "lorebook_turn_snapshots",
    "world_turn_snapshots",
)


def _uuid(value: object) -> str:
    if not isinstance(value, str) or UUID_PATTERN.fullmatch(value) is None:
        raise ValueError("UUID no canónico en respaldo")
    try:
        if str(uuid.UUID(value)) != value:
            raise ValueError("UUID no canónico en respaldo")
    except (TypeError, ValueError) as exc:
        raise ValueError("UUID no canónico en respaldo") from exc
    return value


def _columns(db, table: str) -> tuple[str, ...]:
    # table is always an internal, hardcoded allowlist member.
    return tuple(row[1] for row in db.execute("PRAGMA table_info(" + table + ")"))


def _family(db, story_id: str) -> list[dict]:
    all_stories = [dict(row) for row in db.execute("SELECT * FROM stories")]
    by_id = {row["id"]: row for row in all_stories}
    if story_id not in by_id:
        raise ValueError("Historia inexistente")
    root = story_id
    visited = set()
    while by_id[root].get("origin_story_id") in by_id:
        if root in visited:
            raise ValueError("Se detectó un ciclo de ramas inválido")
        visited.add(root)
        root = by_id[root]["origin_story_id"]
    ordered, pending = [], [root]
    while pending:
        current = pending.pop(0)
        if current in {row["id"] for row in ordered}:
            raise ValueError("Árbol de ramas cíclico")
        ordered.append(by_id[current])
        pending.extend(sorted(
            (row["id"] for row in all_stories
             if row.get("origin_story_id") == current), key=str))
        if len(ordered) > MAX_STORIES:
            raise ValueError("El árbol supera el máximo de 64 historias")
    return ordered


def _owned_file(root: Path, name: str, allowed: set[str]) -> Path:
    match = MEDIA_PATH.fullmatch(name)
    if match is None or _uuid(match.group(1)) not in allowed:
        raise ValueError("Ruta de recurso no permitida en respaldo")
    sub = match.group(2)
    if sub.startswith(("creator/", "images/")):
        _uuid(sub.split("/")[1].split(".")[0])
    media = root / "story-assets"
    result = root / PurePosixPath(name)
    if media.is_symlink() or result.is_symlink():
        raise ValueError("Enlace simbólico fuera de recursos administrados")
    # Verify every existing path component rather than only the last file.
    for parent in (media, media / match.group(1), result.parent):
        if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
            raise ValueError("Directorio de recursos no confiable")
    if not result.resolve().is_relative_to(media.resolve()):
        raise ValueError("Ruta de recurso fuera del almacenamiento")
    return result


def _list_owned_files(narrative, ids: set[str]) -> list[tuple[str, Path]]:
    root = narrative.store.root
    found: list[tuple[str, Path]] = []
    for story_id in sorted(ids):
        folder = root / "story-assets" / story_id
        if folder.is_symlink():
            raise ValueError("Carpeta visual enlazada no confiable")
        if not folder.exists():
            continue
        if not folder.is_dir():
            raise ValueError("Carpeta visual inválida")
        for path in sorted(folder.rglob("*")):
            if path.is_symlink():
                raise ValueError("Enlace simbólico en el directorio visual")
            if path.is_dir():
                continue
            if not path.is_file():
                raise ValueError("Recurso visual no es archivo regular")
            relative = path.relative_to(root).as_posix()
            if MEDIA_PATH.fullmatch(relative):
                verified = _owned_file(root, relative, ids)
                found.append((relative, verified))
                if len(found) > MAX_FILES:
                    raise ValueError("Demasiados recursos visuales en respaldo")
            # Files in progress (*.part) are deliberately not included.
    return found


def build_archive(narrative, story_id: str) -> bytes:
    _uuid(story_id)
    with narrative.store._conn() as db:
        db.execute("BEGIN IMMEDIATE")
        members = _family(db, story_id)
        ids = {row["id"] for row in members}
        selected = ",".join("?" for _ in ids)
        rows = {}
        total_rows = 0
        for table in TABLES:
            if table == "stories":
                records = members
            else:
                records = [dict(row) for row in db.execute(
                    "SELECT * FROM " + table + " WHERE story_id IN (" + selected + ")",
                    tuple(sorted(ids)))]
            rows[table] = records
            total_rows += len(records)
            if total_rows > MAX_ROWS:
                raise ValueError("La historia supera el límite de registros")
        names = _list_owned_files(narrative, ids)
        entries: list[tuple[str, bytes]] = []
        files = []
        total = 0
        for name, path in names:
            size = path.stat().st_size
            if size > MAX_FILE_BYTES or total + size > MAX_DATA_BYTES:
                raise ValueError("Recursos visuales demasiado grandes para el respaldo")
            data = path.read_bytes()
            total += len(data)
            files.append({"path": name, "size": len(data),
                          "sha256": hashlib.sha256(data).hexdigest()})
            entries.append((name, data))
        manifest = {"format": FORMAT, "version": VERSION,
                    "root_story_id": members[0]["id"],
                    "tables": rows, "files": files}
        raw = json.dumps(manifest, ensure_ascii=False, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
        if len(raw) > MAX_MANIFEST_BYTES:
            raise ValueError("Metadatos de respaldo demasiado grandes")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_out:
            zip_out.writestr("manifest.json", raw)
            for name, data in entries:
                zip_out.writestr(name, data)
        return buffer.getvalue()


def _inspect_zip(payload: bytes, narrative) -> tuple[dict, list[tuple[str, bytes]], list[dict]]:
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValueError("El respaldo supera el tamaño permitido")
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except (OSError, zipfile.BadZipFile) as exc:
        raise ValueError("El archivo no es un ZIP válido") from exc
    with archive as source:
        infos = source.infolist()
        names = [item.filename for item in infos]
        if len(names) != len(set(names)) or not names or names[0] != "manifest.json":
            raise ValueError("ZIP duplicado o sin manifest inicial")
        if len(names) > MAX_FILES + 1:
            raise ValueError("Demasiados archivos en respaldo")
        head = infos[0]
        if head.file_size > MAX_MANIFEST_BYTES:
            raise ValueError("Manifest demasiado grande")
        try:
            manifest = json.loads(source.read(head))
        except (ValueError, RuntimeError, OSError, zipfile.BadZipFile) as exc:
            raise ValueError("Manifest inválido o corrupto") from exc
        if (not isinstance(manifest, dict)
                or manifest.get("format") != FORMAT
                or type(manifest.get("version")) is not int
                or manifest["version"] != VERSION):
            raise ValueError("Versión de respaldo incompatible")
        table_data = manifest.get("tables")
        if not isinstance(table_data, dict) or set(table_data) != set(TABLES):
            raise ValueError("Tablas de respaldo inesperadas o ausentes")
        stories = table_data["stories"]
        if not isinstance(stories, list) or not 1 <= len(stories) <= MAX_STORIES:
            raise ValueError("Conjunto de historias inválido")
        ids = [_uuid(row.get("id")) for row in stories if isinstance(row, dict)]
        if len(ids) != len(stories) or len(ids) != len(set(ids)):
            raise ValueError("Historias duplicadas o inválidas")
        allowed = set(ids)
        root_story_id = _uuid(manifest.get("root_story_id"))
        if root_story_id not in allowed:
            raise ValueError("Raíz de historias inexistente")
        seen = {root_story_id}
        if stories[0]["id"] != root_story_id:
            raise ValueError("La primera historia debe ser la raíz")
        # Validate a complete connected tree. No missing parents or cycles.
        if stories[0].get("origin_story_id") is not None:
            raise ValueError("El origen del árbol no es independiente")
        for story in stories[1:]:
            if story.get("origin_story_id") not in seen:
                raise ValueError("Padre de rama ausente o árbol fuera de orden")
            seen.add(story["id"])
        total_rows = 0
        with narrative.store._conn() as db:
            for table in TABLES:
                records = table_data[table]
                if not isinstance(records, list):
                    raise ValueError("Registros de respaldo no válidos")
                columns = set(_columns(db, table))
                if not columns:
                    raise ValueError("Tabla de respaldo no soportada: " + table)
                total_rows += len(records)
                if total_rows > MAX_ROWS:
                    raise ValueError("Demasiadas filas en respaldo")
                for record in records:
                    if not isinstance(record, dict):
                        raise ValueError("Columnas ajenas o incompatibles en " + table)
                    # Schema extension in v1: old exported media rows predate
                    # sprite expressions and poses. Only these two explicitly
                    # defaultable columns may be absent; never ignore unknowns.
                    if (table == "creator_media_assets"
                            and set(record) == columns - {"expression", "pose"}):
                        record["expression"] = "neutral"
                        record["pose"] = "standing"
                    # Earlier v1 archives did not include render provenance.
                    # This extension has an unambiguous, empty legacy default.
                    if (table == "visual_assets"
                            and set(record) == columns - {"render_details_json"}):
                        record["render_details_json"] = "{}"
                    if set(record) != columns:
                        raise ValueError("Columnas ajenas o incompatibles en " + table)
                    if table == "visual_assets":
                        try:
                            details = json.loads(record["render_details_json"])
                        except (TypeError, ValueError) as exc:
                            raise ValueError("Metadatos visuales JSON inválidos") from exc
                        if not isinstance(details, dict):
                            raise ValueError("Metadatos visuales deben ser un objeto JSON")
                    if table != "stories":
                        if record.get("story_id") not in allowed:
                            raise ValueError("Registro fuera del árbol de historias")
            turns = {row["id"] for row in table_data["story_turns"]}
            for table in TABLES:
                if table.endswith("_turn_snapshots"):
                    for record in table_data[table]:
                        if record["turn_id"] not in turns:
                            raise ValueError("Instantánea de turno externo")
            for record in table_data["story_turns"]:
                if record["story_id"] not in allowed:
                    raise ValueError("Turno fuera del conjunto de historias")
        file_list = manifest.get("files")
        if not isinstance(file_list, list) or len(file_list) != len(names)-1:
            raise ValueError("Listado de archivos incompleto")
        data_files: list[tuple[str, bytes]] = []
        total = 0
        for idx, file in enumerate(file_list, 1):
            if (not isinstance(file, dict) or set(file) != {"path","size","sha256"}
                    or not isinstance(file["path"], str) or file["path"] != names[idx]):
                raise ValueError("Nombre de archivo no coincide con manifest")
            _owned_file(narrative.store.root, file["path"], allowed)
            info = infos[idx]
            if info.is_dir() or info.file_size > MAX_FILE_BYTES:
                raise ValueError("Entrada ZIP no permitida")
            total += info.file_size
            if total > MAX_DATA_BYTES or info.file_size != file["size"]:
                raise ValueError("Tamaño del recurso inconsistente")
            if info.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError("Enlaces simbólicos no permitidos")
            try:
                data = source.read(info)
            except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
                raise ValueError("Archivo corrupto dentro del respaldo") from exc
            if hashlib.sha256(data).hexdigest() != file["sha256"]:
                raise ValueError("SHA256 del recurso no coincide")
            data_files.append((file["path"], data))
    return manifest, data_files, stories


def _copy_archive_ids(manifest: dict, files: list[tuple[str, bytes]]
                      ) -> tuple[dict, list[tuple[str, bytes]], dict[str, str]]:
    """Regenerate *all* in-family UUIDs, including historical-only references.

    Only UUID-valued fields, structured JSON references and owned filenames are
    remapped. Freeform story text and generated prose are never rewritten.
    """
    id_map: dict[str, str] = {}

    def register(value):
        if isinstance(value, str) and UUID_PATTERN.fullmatch(value):
            canonical = _uuid(value)
            if canonical not in id_map:
                id_map[canonical] = str(uuid.uuid4())

    def visit(value):
        if isinstance(value, dict):
            # WorldState relationships use character UUIDs as JSON *keys*.
            # These are references just like IDs in lists and JSON values.
            for key, nested in value.items():
                register(key)
                visit(nested)
        elif isinstance(value, list):
            for nested in value:
                visit(nested)
        else:
            register(value)

    for rows in manifest["tables"].values():
        for row in rows:
            for column, value in row.items():
                if column == "id" or column.endswith("_id") or column == "request_id":
                    register(value)
                elif column.endswith("_json") or column in {"visible_character_ids"}:
                    try:
                        visit(json.loads(value))
                    except (TypeError, ValueError) as exc:
                        raise ValueError("JSON estructurado inválido en respaldo: " + column) from exc
    for path, _ in files:
        # This path was already canonicalized and SHA-checked by _inspect_zip.
        for match in UUID_PATTERN.finditer(path):
            register(match.group(0))
    register(manifest["root_story_id"])

    def transform(value):
        if isinstance(value, str):
            return id_map.get(value, value)
        if isinstance(value, list):
            return [transform(x) for x in value]
        if isinstance(value, dict):
            return {id_map.get(key, key): transform(x)
                    for key, x in value.items()}
        return value

    copied_tables = {}
    for table, rows in manifest["tables"].items():
        copied_rows = []
        for row in rows:
            new_row = {}
            for column, value in row.items():
                if (column.endswith("_json") or column == "visible_character_ids"):
                    new_row[column] = json.dumps(
                        transform(json.loads(value)), ensure_ascii=False,
                        separators=(",", ":"))
                elif column == "id" or column.endswith("_id") or column == "request_id":
                    new_row[column] = transform(value)
                elif column in {"filename", "file_name"} and isinstance(value, str):
                    new_row[column] = UUID_PATTERN.sub(
                        lambda match: id_map.get(match.group(0), match.group(0)), value)
                else:
                    new_row[column] = value
            if table == "stories":
                new_row["title"] = (new_row["title"][:88].rstrip() + " (copia)")
            copied_rows.append(new_row)
        copied_tables[table] = copied_rows

    def new_path(path: str) -> str:
        return UUID_PATTERN.sub(
            lambda match: id_map.get(match.group(0), match.group(0)), path)

    copied_files = [(new_path(path), data) for path, data in files]
    result = dict(manifest)
    result["root_story_id"] = transform(manifest["root_story_id"])
    result["tables"] = copied_tables
    result["files"] = [
        {**item, "path": new_path(item["path"])}
        for item in manifest["files"]
    ]
    return result, copied_files, id_map


def restore_archive(narrative, payload: bytes, *, as_copy: bool = False) -> dict:
    """All-or-nothing import. Copy mode remaps all internal UUID references."""
    manifest, files, stories = _inspect_zip(payload, narrative)
    original_root = manifest["root_story_id"]
    id_map = {}
    if as_copy:
        manifest, files, id_map = _copy_archive_ids(manifest, files)
        stories = manifest["tables"]["stories"]
    ids = [row["id"] for row in stories]
    root = narrative.store.root
    assets_root = root / "story-assets"
    if assets_root.is_symlink():
        raise ValueError("Almacenamiento visual no confiable")
    assets_root.mkdir(parents=True, exist_ok=True)
    stage = narrative._fork_stage_root()
    added_dirs: list[Path] = []
    markers: list[Path] = []
    try:
        with narrative.store._conn() as db:
            db.execute("PRAGMA synchronous=FULL")
            db.execute("BEGIN IMMEDIATE")
            for sid in ids:
                if db.execute("SELECT 1 FROM stories WHERE id=?", (sid,)).fetchone():
                    raise FileExistsError("La historia ya existe: " + sid)
                folder = assets_root / sid
                if folder.exists() or folder.is_symlink():
                    raise FileExistsError("La carpeta de historia ya existe: " + sid)
                marker = stage / (sid + ".pending")
                if marker.exists() or marker.is_symlink():
                    raise FileExistsError("Marcador de importación ya presente")
            stage.mkdir(parents=True, exist_ok=True)
            narrative._fsync_directory(stage.parent)
            for sid in ids:
                marker = stage / (sid + ".pending")
                with marker.open("x", encoding="utf-8") as stream:
                    stream.write(sid)
                    stream.flush()
                    os.fsync(stream.fileno())
                markers.append(marker)
            narrative._fsync_directory(stage)
            for sid in ids:
                folder = assets_root / sid
                folder.mkdir()
                added_dirs.append(folder)
            for name, data in files:
                path = _owned_file(root, name, set(ids))
                path.parent.mkdir(parents=True, exist_ok=True)
                if path.exists() or path.is_symlink():
                    raise ValueError("Colisión de archivo durante restauración")
                with path.open("xb") as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
            for folder in added_dirs:
                narrative._sync_fork_files(folder)
            # Copy data in an allowlisted dependency order.
            for table in TABLES:
                records = manifest["tables"][table]
                if not records:
                    continue
                columns = _columns(db, table)
                query = ("INSERT INTO " + table + " (" +
                         ",".join(columns) + ") VALUES (" +
                         ",".join("?" for _ in columns) + ")")
                db.executemany(query, [
                    tuple(record[column] for column in columns)
                    for record in records
                ])
            if narrative.episodes is not None:
                for turn in manifest["tables"]["story_turns"]:
                    narrative.episodes.index_turn_in_transaction(db, turn)
    except Exception:
        for folder in reversed(added_dirs):
            if folder.is_dir() and not folder.is_symlink():
                shutil.rmtree(folder)
        if added_dirs:
            narrative._fsync_directory(assets_root)
        for marker in markers:
            marker.unlink(missing_ok=True)
        if markers:
            narrative._fsync_directory(stage)
        raise
    for marker in markers:
        try:
            marker.unlink(missing_ok=True)
            narrative._fsync_directory(stage)
        except OSError:
            # A committed story must not be rolled back because the marker's
            # unlink failed; startup reconciliation removes this marker.
            pass
    return {"root_story_id": manifest["root_story_id"],
            "restored_stories": len(ids),
            "restored_files": len(files),
            "story_ids": ids,
            "imported_as_copy": as_copy,
            "original_root_story_id": original_root,
            "story_id_map": {old: new for old, new in id_map.items()
                             if new in ids} if as_copy else {}}


def mount_story_archive_routes(app, narrative) -> None:
    @app.get("/api/v1/stories/{story_id}/archive.noble.zip")
    def export_family(story_id: uuid.UUID):
        try:
            binary = build_archive(narrative, str(story_id))
        except ValueError as exc:
            raise HTTPException(404 if "inexistente" in str(exc) else 422,
                                str(exc)) from exc
        return Response(
            content=binary, media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="noble-family.noble.zip"',
                     "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @app.post("/api/v1/stories/archive/import", status_code=201)
    async def import_family(file: UploadFile = File(...), as_copy: bool = False):
        if not file.filename or not file.filename.endswith(".noble.zip"):
            raise HTTPException(422, "Se requiere un archivo .noble.zip")
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
        try:
            return restore_archive(narrative, raw, as_copy=as_copy)
        except FileExistsError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError, sqlite3.IntegrityError) as exc:
            raise HTTPException(422, str(exc)[:300]) from exc
