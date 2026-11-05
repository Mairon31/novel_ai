"""Author-managed scene backgrounds and transparent character sprites.

Media selection only looks at saved narrative and explicit image captions.
It NEVER starts diffusion or uploads private story content to other providers.
"""
from __future__ import annotations

import io
import re
import shutil
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

from .narrative import NarrativeService

MAX_MEDIA_BYTES = 12 * 1024 * 1024
MAX_MEDIA_PIXELS = 20_000_000
STOP_WORDS = frozenset({
    "a", "al", "de", "del", "el", "ella", "en", "es", "esta", "este", "estos", "la",
    "las", "lo", "los", "que", "un", "una", "uno", "y", "por", "para", "con", "cuando",
    "and", "at", "in", "of", "on", "the", "to", "with", "scene", "escena", "imagen",
})


class AssetCaption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: str = Field(min_length=3, max_length=220)
    label: str = Field(min_length=1, max_length=100)


def _tokens(value: str) -> set[str]:
    return {item for item in re.findall(r"[^\W_]+", value.casefold(), re.UNICODE)
            if len(item) >= 3 and item not in STOP_WORDS}


def _score(caption: str, context: str) -> int:
    """Deliberately conservative lexical matching; no 'AI confidence' claim."""
    words = _tokens(caption)
    if not words:
        return 0
    context_words = _tokens(context)
    matched = words & context_words
    if not matched:
        return 0
    # Single-word captions should only match full word boundaries, not substrings.
    # Multi-word captions require two matching descriptive terms.
    if len(words) > 1 and len(matched) < 2:
        return 0
    return len(matched) * 10 + (10 if words <= context_words else 0)


def _safe_image(data: bytes, kind: str) -> tuple[bytes, str]:
    if not 0 < len(data) <= MAX_MEDIA_BYTES:
        raise ValueError("La imagen debe ocupar entre 1 byte y 12 MiB")
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Formato no admitido")
            if img.width < 8 or img.height < 8 or img.width * img.height > MAX_MEDIA_PIXELS:
                raise ValueError("Resolución de imagen inválida")
            img.load()
            photo = ImageOps.exif_transpose(img)
            photo.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            if kind == "foreground":
                # Preserve real transparency (unlike RGB-only story-gallery art).
                photo.convert("RGBA").save(output, "PNG", optimize=True)
                return output.getvalue(), "image/png"
            photo.convert("RGB").save(output, "WEBP", quality=88, method=5)
            return output.getvalue(), "image/webp"
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("La imagen no pudo decodificarse") from exc


class CreatorMediaService:
    def __init__(self, narrative: NarrativeService):
        self.narrative = narrative
        self.store = narrative.store
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS creator_media_assets (
                    id TEXT PRIMARY KEY,
                    story_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    label TEXT NOT NULL,
                    caption TEXT NOT NULL,
                    character_id TEXT,
                    filename TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS creator_media_by_story
                    ON creator_media_assets(story_id,kind,created_at);
            """)

    def _require_story(self, story_id: str) -> None:
        if not self.narrative.get_story(story_id):
            raise ValueError("Historia inexistente")

    def _path(self, story_id: str, asset_id: str, kind: str) -> Path:
        suffix = ".png" if kind == "foreground" else ".webp"
        return self.store.root / "story-assets" / story_id / "creator" / (asset_id + suffix)

    def list(self, story_id: str) -> list[dict]:
        self._require_story(story_id)
        with self.store._conn() as db:
            rows = [dict(row) for row in db.execute(
                "SELECT * FROM creator_media_assets WHERE story_id=? "
                "ORDER BY created_at DESC,id DESC", (story_id,))]
        for row in rows:
            row["url"] = (f"/api/v1/stories/{story_id}/creator/assets/"
                          f"{row['id']}/file")
        return rows

    def get(self, story_id: str, asset_id: str) -> dict:
        with self.store._conn() as db:
            row = db.execute("SELECT * FROM creator_media_assets WHERE story_id=? AND id=?",
                             (story_id, asset_id)).fetchone()
        if not row:
            raise ValueError("Recurso visual inexistente en esta historia")
        return dict(row)

    def add(self, story_id: str, kind: str, label: str, caption: str,
            data: bytes, character_id: str | None = None) -> dict:
        self._require_story(story_id)
        if kind not in ("background", "foreground"):
            raise ValueError("El recurso debe ser fondo o primer plano")
        form = AssetCaption(label=label, caption=caption)
        if character_id:
            if kind != "foreground":
                raise ValueError("Solo los primeros planos pueden asociarse a un personaje")
            with self.store._conn() as db:
                character = db.execute(
                    "SELECT 1 FROM creator_characters WHERE story_id=? AND id=?",
                    (story_id, character_id)).fetchone()
            if not character:
                raise ValueError("Personaje de otra historia o inexistente")
        processed, media_type = _safe_image(data, kind)
        ident = str(uuid.uuid4())
        file = self._path(story_id, ident, kind)
        file.parent.mkdir(parents=True, exist_ok=True)
        try:
            file.write_bytes(processed)
            with self.store._conn() as db:
                db.execute(
                    "INSERT INTO creator_media_assets VALUES(?,?,?,?,?,?,?,?,?)",
                    (ident, story_id, kind, form.label.strip(), form.caption.strip(),
                     character_id, file.name, media_type, time.time()))
        except Exception:
            file.unlink(missing_ok=True)
            raise
        return next(row for row in self.list(story_id) if row["id"] == ident)

    def update_caption(self, story_id: str, asset_id: str, form: AssetCaption) -> dict:
        self.get(story_id, asset_id)
        with self.store._conn() as db:
            db.execute("UPDATE creator_media_assets SET label=?,caption=? "
                       "WHERE story_id=? AND id=?",
                       (form.label.strip(), form.caption.strip(), story_id, asset_id))
        return next(row for row in self.list(story_id) if row["id"] == asset_id)

    def delete(self, story_id: str, asset_id: str) -> None:
        item = self.get(story_id, asset_id)
        file = self._path(story_id, asset_id, item["kind"])
        with self.store._conn() as db:
            db.execute("DELETE FROM creator_media_assets WHERE story_id=? AND id=?",
                       (story_id, asset_id))
        file.unlink(missing_ok=True)

    def file(self, story_id: str, asset_id: str) -> FileResponse:
        item = self.get(story_id, asset_id)
        file = self._path(story_id, asset_id, item["kind"])
        if not file.is_file() or file.is_symlink():
            raise HTTPException(404, "Archivo visual ausente")
        return FileResponse(
            file, media_type=item["media_type"],
            headers={"Cache-Control": "private, no-store",
                     "X-Content-Type-Options": "nosniff"})

    def presentation(self, story_id: str) -> dict:
        assets = self.list(story_id)
        turns = self.narrative.turns(story_id, limit=1)
        latest = turns[-1]["assistant_text"] if turns else ""
        scene = self.narrative.visual.scene(story_id)
        context = (scene["location"] + "\n" + latest)[:9000]
        selected: dict[str, dict | None] = {}
        for kind in ("background", "foreground"):
            matches = [(asset, _score(asset["caption"], context))
                       for asset in assets if asset["kind"] == kind]
            matches = [(asset, score) for asset, score in matches if score > 0]
            matches.sort(key=lambda pair: (pair[1], pair[0]["created_at"]), reverse=True)
            selected[kind] = matches[0][0] if matches else None
        return {
            "background": selected["background"], "foreground": selected["foreground"],
            "selection": "caption_match" if any(selected.values()) else "no_match",
            "context_excerpt": scene["location"],
            "generated": False,
        }

    def clone(self, source_id: str, target_id: str, character_ids: dict[str,str] | None = None) -> None:
        self._require_story(target_id)
        # Author-owned assets are deliberately cloned, not linked across stories.
        with self.store._conn() as db:
            rows = [dict(row) for row in db.execute(
                "SELECT * FROM creator_media_assets WHERE story_id=?", (source_id,))]
        for row in rows:
            source = self._path(source_id, row["id"], row["kind"])
            if not source.is_file():
                continue
            new_id = str(uuid.uuid4())
            target = self._path(target_id, new_id, row["kind"])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            with self.store._conn() as db:
                db.execute("INSERT INTO creator_media_assets VALUES(?,?,?,?,?,?,?,?,?)",
                           (new_id, target_id, row["kind"], row["label"],
                            row["caption"], (character_ids or {}).get(row["character_id"]),
                            target.name,
                            row["media_type"], time.time()))


def mount_creator_media_routes(app, media: CreatorMediaService) -> None:
    @app.get("/api/v1/stories/{story_id}/creator/assets")
    def get_assets(story_id: uuid.UUID):
        try:
            return {"assets": media.list(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/assets", status_code=201)
    async def upload_asset(story_id: uuid.UUID, kind: Literal["background", "foreground"] = Form(...),
                           label: str = Form(...), caption: str = Form(...),
                           character_id: uuid.UUID | None = Form(None),
                           file: UploadFile = File(...)):
        if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(415, "Solo PNG, JPEG o WebP")
        data = await file.read(MAX_MEDIA_BYTES + 1)
        if len(data) > MAX_MEDIA_BYTES:
            raise HTTPException(413, "Archivo superior a 12 MiB")
        try:
            return media.add(str(story_id), kind, label, caption, data,
                             str(character_id) if character_id else None)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/creator/assets/scene")
    def scene_assets(story_id: uuid.UUID):
        try:
            return media.presentation(str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/creator/assets/{asset_id}/file")
    def asset_file(story_id: uuid.UUID, asset_id: uuid.UUID):
        try:
            return media.file(str(story_id), str(asset_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/creator/assets/{asset_id}")
    def rename_asset(story_id: uuid.UUID, asset_id: uuid.UUID, body: AssetCaption):
        try:
            return media.update_caption(str(story_id), str(asset_id), body)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.delete("/api/v1/stories/{story_id}/creator/assets/{asset_id}", status_code=204)
    def delete_asset(story_id: uuid.UUID, asset_id: uuid.UUID):
        try:
            media.delete(str(story_id), str(asset_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
