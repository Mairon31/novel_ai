"""Opt-in story visual readiness gate. No automatic model inference or file writes.

Only first-turn narrated or author-authored openings are gated. Legacy and
text-mode stories never gain a new dependency on images. A deliberate text-only
choice is persisted per story, while an explicit switch back to visuals clears
that choice. Bytes must exist in Noble-owned paths, not just metadata rows.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from .creator_media import CreatorMediaService


class VisualChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text_only: bool


class VisualPreflight:
    def __init__(self, narrative, creator_media: CreatorMediaService):
        self.narrative = narrative
        self.media = creator_media
        self.store = narrative.store
        with self.store._conn() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS visual_preflight_choices("
                "story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE, "
                "text_only INTEGER NOT NULL CHECK(text_only IN (0,1)), "
                "updated_at REAL NOT NULL)"
            )

    def _valid_media(self, story_id: str, asset: dict) -> bool:
        try:
            file = self.media._path(story_id, asset["id"], asset["kind"])
            return file.is_file() and not file.is_symlink()
        except (ValueError, OSError, KeyError):
            return False

    def status(self, story_id: str) -> dict:
        with self.store._conn() as db:
            story = db.execute("SELECT id,cover_asset_id FROM stories WHERE id=?",
                               (story_id,)).fetchone()
            if story is None:
                raise ValueError("Story not found")
            started = db.execute("SELECT 1 FROM story_turns WHERE story_id=? LIMIT 1",
                                 (story_id,)).fetchone() is not None
            blueprint = db.execute(
                "SELECT config_json FROM creator_blueprints WHERE story_id=?",
                (story_id,)).fetchone()
            mode: Literal["text", "cover_background", "cover_background_cast"] = "text"
            if blueprint is not None:
                saved = json.loads(blueprint["config_json"])
                if saved.get("visual_start") in {"cover_background", "cover_background_cast"}:
                    mode = saved["visual_start"]
            choice = db.execute(
                "SELECT text_only FROM visual_preflight_choices WHERE story_id=?",
                (story_id,)).fetchone()
            text_only = bool(choice["text_only"]) if choice else False
            assets = [dict(row) for row in db.execute(
                "SELECT id,kind,character_id,expression FROM creator_media_assets "
                "WHERE story_id=?", (story_id,)
            )]
            characters = [dict(row) for row in db.execute(
                "SELECT id,config_json FROM creator_characters WHERE story_id=? "
                "ORDER BY created_at,id", (story_id,)
            )]
            current = db.execute(
                "SELECT v.id FROM visual_assets v JOIN visual_current c "
                "ON c.asset_id=v.id AND c.story_id=v.story_id "
                "WHERE v.story_id=?", (story_id,)
            ).fetchone()

        missing: list[dict] = []
        if mode != "text" and not started:
            if not any(item["kind"] == "cover" and
                       item["id"] == story["cover_asset_id"] and
                       self._valid_media(story_id, item) for item in assets):
                missing.append({"kind": "cover"})
            background_ok = any(item["kind"] == "background" and
                                self._valid_media(story_id, item) for item in assets)
            if not background_ok and current is not None and self.narrative.visual:
                try:
                    path = self.narrative.visual._asset_path(story_id, current["id"])
                    background_ok = path.is_file() and not path.is_symlink()
                except (ValueError, OSError):
                    background_ok = False
            if not background_ok:
                missing.append({"kind": "background"})
            if mode == "cover_background_cast":
                for character in characters:
                    identity = character["id"]
                    if not any(item["kind"] == "foreground" and
                               item["character_id"] == identity and
                               item["expression"] == "neutral" and
                               self._valid_media(story_id, item) for item in assets):
                        name = json.loads(character["config_json"]).get("name", "")
                        missing.append({"kind": "character",
                                        "character_id": identity, "name": name})
        # A story that already started must remain playable even if art is
        # later removed or an author changes its visual settings.
        ready = bool(started or mode == "text" or text_only or not missing)
        return {"story_id": story_id, "mode": mode, "ready": ready,
                "has_started": started, "text_only": text_only,
                "missing": missing}

    def require_ready(self, story_id: str) -> None:
        if not self.status(story_id)["ready"]:
            raise ValueError("Visual preparation required before the first story turn")

    def set_choice(self, story_id: str, text_only: bool) -> dict:
        # Never allow a missing or unrelated story to create an orphan choice.
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            found = db.execute("SELECT 1 FROM stories WHERE id=?", (story_id,)).fetchone()
            if found is None:
                raise ValueError("Story not found")
            db.execute(
                "INSERT INTO visual_preflight_choices(story_id,text_only,updated_at) "
                "VALUES (?,?,?) ON CONFLICT(story_id) DO UPDATE SET "
                "text_only=excluded.text_only, updated_at=excluded.updated_at",
                (story_id, int(text_only), time.time())
            )
        return self.status(story_id)


def mount_visual_preflight_routes(app, service: VisualPreflight) -> None:
    @app.get("/api/v1/stories/{story_id}/visual-preflight")
    def get_status(story_id: uuid.UUID):
        try:
            return service.status(str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/visual-preflight/choice")
    def choose(story_id: uuid.UUID, body: VisualChoice):
        try:
            return service.set_choice(str(story_id), body.text_only)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
