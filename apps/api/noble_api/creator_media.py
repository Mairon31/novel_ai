"""Author-managed scene backgrounds and transparent character sprites.

Media selection only looks at saved narrative and explicit image captions.
It NEVER starts diffusion or uploads private story content to other providers.
"""
from __future__ import annotations

import io
from contextlib import nullcontext
import json
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
EXPRESSIONS = ("neutral", "joy", "anger", "sadness", "surprise")
POSE_PATTERN = re.compile(r"[a-z0-9_-]{1,32}")
EXPRESSION_HINTS = {
    "joy": r"sonr[ií]e|sonri[oó]|feliz|alegr[eí]|r[ií]e|laugh|smil",
    "anger": r"enojad|enfurecid|furios|airad|grit[aó]|angry|furious",
    "sadness": r"trist|llor[aó]|solloz|apenad|sad|crying",
    "surprise": r"sorprendid|asombrad|boquiabiert|astonish|surpris",
}

STOP_WORDS = frozenset({
    "a", "al", "de", "del", "el", "ella", "en", "es", "esta", "este", "estos", "la",
    "las", "lo", "los", "que", "un", "una", "uno", "y", "por", "para", "con", "cuando",
    "and", "at", "in", "of", "on", "the", "to", "with", "scene", "escena", "imagen",
})


class AssetCaption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: str = Field(min_length=3, max_length=220)
    label: str = Field(min_length=1, max_length=100)
    expression: Literal["neutral", "joy", "anger", "sadness", "surprise"] | None = None
    pose: str | None = Field(default=None, max_length=32)


def validate_pose(pose: str) -> str:
    normalized = pose.strip().casefold()
    if not POSE_PATTERN.fullmatch(normalized):
        raise ValueError("La pose debe usar 1–32 letras ASCII, números, guiones o guion bajo")
    return normalized


def _expression_in_text(text: str, name: str, cast_names=()) -> str:
    """Associate an expression with its named NPC, not the next NPC's mood."""
    matches = list(re.finditer(r"(?<!\w)" + re.escape(name) + r"(?!\w)",
                               text, re.IGNORECASE))
    other_names = [other for other in cast_names if other and other.casefold() != name.casefold()]
    for mention in reversed(matches):
        end = min(len(text), mention.end() + 100)
        suffix = text[mention.end():end]
        punctuation = re.search(r"[.!?;\n]", suffix)
        if punctuation:
            end = min(end, mention.end() + punctuation.start())
        for other in other_names:
            next_name = re.search(r"(?<!\w)" + re.escape(other) + r"(?!\w)",
                                  text[mention.end():end], re.IGNORECASE)
            if next_name:
                end = min(end, mention.end() + next_name.start())
        # A short left-side window catches "sonríe Aira" while limiting
        # accidental emotion bleed from an unrelated earlier sentence.
        left = text[max(0, mention.start()-24):mention.start()]
        preceding_end = re.search(r"[.!?;\n](?!.*[.!?;\n])", left)
        begin = (max(0, mention.start()-24) + preceding_end.end()
                 if preceding_end else max(0, mention.start()-24))
        context = text[begin:end]
        for emotion, pattern in EXPRESSION_HINTS.items():
            if re.search(pattern, context, re.IGNORECASE):
                return emotion
    return "neutral"


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
                    created_at REAL NOT NULL,
                    expression TEXT NOT NULL DEFAULT 'neutral',
                    pose TEXT NOT NULL DEFAULT 'standing'
                );
                CREATE INDEX IF NOT EXISTS creator_media_by_story
                    ON creator_media_assets(story_id,kind,created_at);
                CREATE TABLE IF NOT EXISTS creator_media_turn_snapshots(
                    turn_id TEXT PRIMARY KEY REFERENCES story_turns(id) ON DELETE CASCADE,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    assets_json TEXT NOT NULL,
                    cover_asset_id TEXT,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS creator_media_turn_history
                    ON creator_media_turn_snapshots(story_id,created_at,turn_id);
            """)
            # Upgrade databases created before expression/pose variants existed.
            media_columns = {row["name"] for row in db.execute(
                "PRAGMA table_info(creator_media_assets)")}
            if "expression" not in media_columns:
                db.execute("ALTER TABLE creator_media_assets ADD COLUMN "
                           "expression TEXT NOT NULL DEFAULT 'neutral'")
            if "pose" not in media_columns:
                db.execute("ALTER TABLE creator_media_assets ADD COLUMN "
                           "pose TEXT NOT NULL DEFAULT 'standing'")
            db.execute("""CREATE INDEX IF NOT EXISTS creator_sprite_variant
                ON creator_media_assets(story_id,kind,character_id,expression,pose)""")

    def _require_story(self, story_id: str) -> None:
        if not self.narrative.get_story(story_id):
            raise ValueError("Historia inexistente")

    def _path(self, story_id: str, asset_id: str, kind: str) -> Path:
        """Resolve only owned UUID assets, never symlinks escaping the data directory.

        IDs are normally generated by Noble, but rows can also be imported from
        backup databases; never trust a stored filename or directory component.
        """
        try:
            if str(uuid.UUID(story_id)) != story_id or str(uuid.UUID(asset_id)) != asset_id:
                raise ValueError("UUID no canónico")
        except (TypeError, AttributeError, ValueError) as exc:
            raise ValueError("Identificador de recurso visual inválido") from exc
        if kind not in {"cover", "background", "foreground"}:
            raise ValueError("Tipo de recurso visual inválido")
        owned_root = self.store.root.resolve()
        assets_root = owned_root / "story-assets"
        if assets_root.is_symlink():
            raise ValueError("Directorio de recursos visuales no confiable")
        suffix = ".png" if kind == "foreground" else ".webp"
        target = assets_root / story_id / "creator" / (asset_id + suffix)
        if target.is_symlink() or not target.resolve().is_relative_to(assets_root):
            raise ValueError("Ruta de recurso visual fuera del directorio administrado")
        return target

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
            data: bytes, character_id: str | None = None,
            expression: str = "neutral", pose: str = "standing") -> dict:
        self._require_story(story_id)
        if kind not in ("cover", "background", "foreground"):
            raise ValueError("El recurso debe ser portada, fondo o primer plano")
        if not 1 <= len(label.strip()) <= 100:
            raise ValueError("El nombre debe tener entre 1 y 100 caracteres")
        if not 3 <= len(caption.strip()) <= 220:
            raise ValueError("La descripción debe tener entre 3 y 220 caracteres")
        form = AssetCaption(label=label.strip(), caption=caption.strip())
        if expression not in EXPRESSIONS:
            raise ValueError("Expresión de personaje no admitida")
        pose = validate_pose(pose)
        if kind != "foreground" and (expression != "neutral" or pose != "standing"):
            raise ValueError("Solo los sprites admiten expresiones y poses")
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
                    "INSERT INTO creator_media_assets "
                    "(id,story_id,kind,label,caption,character_id,filename,"
                    "media_type,created_at,expression,pose) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (ident, story_id, kind, form.label.strip(), form.caption.strip(),
                     character_id, file.name, media_type, time.time(), expression, pose))
        except Exception:
            file.unlink(missing_ok=True)
            raise
        return next(row for row in self.list(story_id) if row["id"] == ident)

    def update_caption(self, story_id: str, asset_id: str, form: AssetCaption) -> dict:
        if not form.label.strip() or len(form.caption.strip()) < 3:
            raise ValueError("El nombre y la descripción no pueden estar vacíos")
        self.get(story_id, asset_id)
        asset = self.get(story_id, asset_id)
        expression = form.expression if form.expression is not None else asset["expression"]
        pose = validate_pose(form.pose) if form.pose is not None else asset["pose"]
        if asset["kind"] != "foreground" and (expression != "neutral" or pose != "standing"):
            raise ValueError("Solo los sprites admiten expresiones y poses")
        with self.store._conn() as db:
            db.execute("UPDATE creator_media_assets "
                       "SET label=?,caption=?,expression=?,pose=? "
                       "WHERE story_id=? AND id=?",
                       (form.label.strip(), form.caption.strip(), expression, pose,
                        story_id, asset_id))
        return next(row for row in self.list(story_id) if row["id"] == asset_id)

    def set_cover(self, story_id: str, asset_id: str | None) -> dict:
        self._require_story(story_id)
        if asset_id is not None:
            asset = self.get(story_id, asset_id)
            if asset["kind"] != "cover":
                raise ValueError("Solo una imagen de tipo portada puede ser portada editorial")
            path = self._path(story_id, asset_id, "cover")
            if not path.is_file() or path.is_symlink():
                raise ValueError("El archivo de portada no está disponible")
        with self.store._conn() as db:
            db.execute("UPDATE stories SET cover_asset_id=?,updated_at=? WHERE id=?",
                       (asset_id, time.time(), story_id))
        return self.narrative.get_story(story_id)

    def delete(self, story_id: str, asset_id: str) -> None:
        item = self.get(story_id, asset_id)
        file = self._path(story_id, asset_id, item["kind"])
        with self.store._conn() as db:
            # Preserve immutable bytes needed to rewind a committed turn;
            # live records and URLs are still removed immediately.
            keep_historical = any(
                any(asset["id"] == asset_id for asset in json.loads(row["assets_json"]))
                for row in db.execute(
                    "SELECT assets_json FROM creator_media_turn_snapshots WHERE story_id=?",
                    (story_id,))
            )
            db.execute("DELETE FROM creator_media_assets WHERE story_id=? AND id=?",
                       (story_id, asset_id))
            db.execute("UPDATE stories SET cover_asset_id=NULL,updated_at=? "
                       "WHERE id=? AND cover_asset_id=?", (time.time(), story_id, asset_id))
        if not keep_historical:
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
        """Compose a saved background and up to three named transparent sprites.

        Eligibility is determined by *completed, visible* narration only.
        A sprite variant is selected by explicit character mention plus a
        local expression hint, with neutral fallback. No inference or assets
        are created, so repeated turns reuse the same PNG bytes.
        """
        assets = self.list(story_id)
        turns = self.narrative.turns(story_id, limit=1)
        latest = turns[-1]["assistant_text"] if turns else ""
        scene = self.narrative.visual.scene(story_id)
        context = (scene["location"] + "\n" + latest)[:9000]
        with self.store._conn() as db:
            linked = {
                row["id"]: json.loads(row["config_json"]).get("name", "")
                for row in db.execute(
                    "SELECT id,config_json FROM creator_characters WHERE story_id=?",
                    (story_id,))
            }

        background_matches = [
            (asset, _score(asset["caption"], context)) for asset in assets
            if asset["kind"] == "background"
        ]
        background_matches = [
            (asset, score) for asset, score in background_matches if score > 0
        ]
        background_matches.sort(
            key=lambda item: (item[1], item[0]["created_at"], item[0]["id"]),
            reverse=True)
        background = background_matches[0][0] if background_matches else None

        # A unique cast per scene avoids stacking different poses of the
        # same person. Order is based on latest mentioned names, not gallery
        # upload order. A name mentioned only in an internal Creator field
        # is never enough to expose a sprite to the reader.
        mentions = []
        for character_id, name in linked.items():
            if not name:
                continue
            occurrences = list(re.finditer(
                r"(?<!\w)" + re.escape(name) + r"(?!\w)", latest,
                re.IGNORECASE))
            if occurrences:
                mentions.append((occurrences[-1].start(), character_id, name))
        mentions.sort(key=lambda row: row[0], reverse=True)
        speaker_character_id = mentions[0][1] if mentions else None
        sprites: list[dict] = []

        for _, character_id, name in mentions:
            options = [asset for asset in assets if asset["kind"] == "foreground"
                       and asset["character_id"] == character_id]
            wanted = _expression_in_text(latest, name, linked.values())
            scored = [(asset, _score(asset["caption"], context))
                      for asset in options if asset["expression"] in {wanted, "neutral"}]
            scored = [(asset, score) for asset, score in scored if score > 0]
            if not scored:
                continue
            scored.sort(key=lambda item: (
                item[0]["expression"] == wanted, item[1],
                item[0]["pose"] == "standing", item[0]["created_at"], item[0]["id"]),
                reverse=True)
            chosen = dict(scored[0][0])
            chosen["expression_target"] = wanted
            chosen["speaker"] = character_id == speaker_character_id
            sprites.append(chosen)
            if len(sprites) >= 3:
                break

        # Legacy unlinked foreground assets may still be used as one generic
        # illustration, but never displace more than one explicitly named NPC.
        if not sprites:
            unlinked = [(asset, _score(asset["caption"], context))
                        for asset in assets if asset["kind"] == "foreground"
                        and asset["character_id"] is None]
            unlinked = [(asset, score) for asset, score in unlinked if score > 0]
            unlinked.sort(key=lambda item: (item[1], item[0]["created_at"]),
                          reverse=True)
            if unlinked:
                sprites.append({**unlinked[0][0],
                                "expression_target": "neutral", "speaker": True})

        return {
            "background": background,
            "foreground": sprites[0] if sprites else None,  # v1 clients
            "sprites": sprites,
            "speaker_character_id": (speaker_character_id
                                     if any(asset["character_id"] == speaker_character_id
                                            for asset in sprites) else None),
            "selection": "caption_match" if background or sprites else "no_match",
            "context_excerpt": scene["location"],
            "generated": False,
        }

    def snapshot_turn_in_transaction(self, db, story_id: str,
                                     turn_id: str, created_at: float) -> None:
        """Checkpoint editorial assets/cover in the same transaction as a turn."""
        assets = [dict(row) for row in db.execute(
            "SELECT * FROM creator_media_assets WHERE story_id=? "
            "ORDER BY created_at,id", (story_id,))]
        story = db.execute("SELECT cover_asset_id FROM stories WHERE id=?",
                           (story_id,)).fetchone()
        db.execute(
            "INSERT INTO creator_media_turn_snapshots "
            "(turn_id,story_id,assets_json,cover_asset_id,created_at) "
            "VALUES (?,?,?,?,?)",
            (turn_id, story_id, json.dumps(assets, ensure_ascii=False),
             story["cover_asset_id"] if story else None, created_at)
        )

    def clone(self, source_id: str, target_id: str,
              character_ids: dict[str, str] | None = None,
              turn_map: dict[str, str] | None = None,
              until_turn_id: str | None = None, conn=None) -> None:
        """Copy only editorial knowledge present at the selected moment.

        Deleted assets referenced in historical snapshots are copied as
        historical bytes, but never reappear in the current library. A partial
        fork without a checkpoint fails closed, rather than leaking future art.
        """
        if conn is None:
            self._require_story(target_id)
        with (nullcontext(conn) if conn is not None else self.store._conn()) as db:
            snapshots = {
                row["turn_id"]: dict(row)
                for row in db.execute(
                    "SELECT * FROM creator_media_turn_snapshots WHERE story_id=?",
                    (source_id,))
            }
            if until_turn_id is None:
                active = [dict(row) for row in db.execute(
                    "SELECT * FROM creator_media_assets WHERE story_id=? "
                    "ORDER BY created_at,id", (source_id,))]
                story = db.execute(
                    "SELECT cover_asset_id FROM stories WHERE id=?", (source_id,)
                ).fetchone()
                chosen_cover = story["cover_asset_id"] if story else None
            else:
                selected = snapshots.get(until_turn_id)
                active = json.loads(selected["assets_json"]) if selected else []
                chosen_cover = selected["cover_asset_id"] if selected else None

            all_assets: dict[str, dict] = {}
            for old_turn in (turn_map or {}):
                snap = snapshots.get(old_turn)
                if snap is not None:
                    for asset in json.loads(snap["assets_json"]):
                        all_assets.setdefault(asset["id"], asset)
            for asset in active:
                all_assets.setdefault(asset["id"], asset)

            mapped: dict[str, str] = {}
            for asset in all_assets.values():
                source = self._path(source_id, asset["id"], asset["kind"])
                if not source.is_file() or source.is_symlink():
                    raise ValueError(
                        "No está disponible un archivo editorial histórico de la historia original")
                fresh_id = str(uuid.uuid4())
                target = self._path(target_id, fresh_id, asset["kind"])
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
                mapped[asset["id"]] = fresh_id

            def remap(asset: dict) -> dict:
                result = dict(asset)
                result["id"] = mapped[asset["id"]]
                result["story_id"] = target_id
                result["character_id"] = (character_ids or {}).get(asset["character_id"])
                result["filename"] = self._path(
                    target_id, result["id"], result["kind"]).name
                return result

            for old_turn, new_turn in (turn_map or {}).items():
                snapshot = snapshots.get(old_turn)
                if snapshot is None:
                    continue
                historic = [remap(row) for row in json.loads(snapshot["assets_json"])]
                db.execute(
                    "INSERT INTO creator_media_turn_snapshots "
                    "(turn_id,story_id,assets_json,cover_asset_id,created_at) "
                    "VALUES (?,?,?,?,?)",
                    (new_turn, target_id, json.dumps(historic, ensure_ascii=False),
                     mapped.get(snapshot["cover_asset_id"]), snapshot["created_at"])
                )
            for asset in active:
                row = remap(asset)
                db.execute(
                    "INSERT INTO creator_media_assets "
                    "(id,story_id,kind,label,caption,character_id,filename,media_type,"
                    "created_at,expression,pose) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (row["id"], row["story_id"], row["kind"], row["label"],
                     row["caption"], row["character_id"], row["filename"],
                     row["media_type"], time.time(),
                     row.get("expression", "neutral"), row.get("pose", "standing"))
                )
            if chosen_cover and chosen_cover in {item["id"] for item in active}:
                db.execute("UPDATE stories SET cover_asset_id=? WHERE id=?",
                           (mapped[chosen_cover], target_id))


class CoverSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: uuid.UUID | None = None


def mount_creator_media_routes(app, media: CreatorMediaService) -> None:
    @app.get("/api/v1/stories/{story_id}/creator/assets")
    def get_assets(story_id: uuid.UUID):
        try:
            return {"assets": media.list(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/assets", status_code=201)
    async def upload_asset(story_id: uuid.UUID, kind: Literal["cover", "background", "foreground"] = Form(...),
                           label: str = Form(...), caption: str = Form(...),
                           character_id: uuid.UUID | None = Form(None),
                           expression: Literal["neutral", "joy", "anger", "sadness", "surprise"] = Form("neutral"),
                           pose: str = Form("standing"),
                           file: UploadFile = File(...)):
        if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(415, "Solo PNG, JPEG o WebP")
        data = await file.read(MAX_MEDIA_BYTES + 1)
        if len(data) > MAX_MEDIA_BYTES:
            raise HTTPException(413, "Archivo superior a 12 MiB")
        try:
            return media.add(str(story_id), kind, label, caption, data,
                             str(character_id) if character_id else None,
                             expression=expression, pose=pose)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/creator/cover")
    def select_story_cover(story_id: uuid.UUID, body: CoverSelection):
        try:
            return media.set_cover(str(story_id), str(body.asset_id) if body.asset_id else None)
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
            raise HTTPException(422, str(exc)) from exc

    @app.delete("/api/v1/stories/{story_id}/creator/assets/{asset_id}", status_code=204)
    def delete_asset(story_id: uuid.UUID, asset_id: uuid.UUID):
        try:
            media.delete(str(story_id), str(asset_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
