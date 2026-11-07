"""Persistent, user-reviewed scene plans for repeatable illustration requests.

Planning does not load a model, select a GPU, or generate any artwork. It binds
composition to the current scene and visual identities belonging to the story.
"""
from __future__ import annotations

import re
from contextlib import nullcontext
import sqlite3
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .visual_state import VisualState

SHOT_LABELS = {
    "wide": "wide shot, full environment",
    "medium": "medium shot, characters and setting",
    "closeup": "close-up, face and expression",
}
LIGHT_LABELS = {
    "natural": "soft natural lighting",
    "sunset": "warm sunset light",
    "night": "night lighting with controlled shadows",
    "interior": "diffused interior lighting",
    "dramatic": "high-contrast cinematic lighting",
}
MAX_CAST = 6


class ScenePlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shot: str = "medium"
    lighting: str = "natural"
    mood: str = Field(default="", max_length=160)
    direction: str = Field(default="", max_length=900)
    visible_character_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_CAST)
    reference_character_id: uuid.UUID | None = None


class ScenePlanner:
    def __init__(self, visual: VisualState):
        self.visual = visual
        with self.visual.store._conn() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS scene_plans(
                scene_id TEXT PRIMARY KEY, story_id TEXT NOT NULL,
                shot TEXT NOT NULL, lighting TEXT NOT NULL,
                mood TEXT NOT NULL, direction TEXT NOT NULL,
                visible_character_ids TEXT NOT NULL, reference_character_id TEXT,
                revision INTEGER NOT NULL, updated_at REAL NOT NULL
            )""")

    def read(self, story_id: str) -> dict:
        scene = self.visual.scene(story_id)
        with self.visual.store._conn() as db:
            row = db.execute("SELECT * FROM scene_plans WHERE scene_id=? AND story_id=?",
                             (scene["id"], story_id)).fetchone()
        if row is None:
            return {
                "scene_id": scene["id"], "story_id": story_id,
                "shot": "medium", "lighting": "natural", "mood": "",
                "direction": "", "visible_character_ids": [],
                "reference_character_id": None,
                "revision": 0, "updated_at": None,
            }
        plan = dict(row)
        import json
        plan["visible_character_ids"] = json.loads(plan["visible_character_ids"])
        return plan

    def save(self, story_id: str, form: ScenePlanInput) -> dict:
        if form.shot not in SHOT_LABELS or form.lighting not in LIGHT_LABELS:
            raise ValueError("Unsupported shot or lighting")
        ids = [str(value) for value in form.visible_character_ids]
        if len(set(ids)) != len(ids):
            raise ValueError("Scene characters cannot be duplicated")
        cast = {character["id"]: character for character in self.visual.characters(story_id)}
        if any(ident not in cast for ident in ids):
            raise ValueError("A character does not belong to this story")
        focus = str(form.reference_character_id) if form.reference_character_id else None
        if focus and focus not in ids:
            raise ValueError("Reference character must appear in the scene")
        scene = self.visual.scene(story_id)
        import json
        with self.visual.store._conn() as db:
            db.execute("""INSERT INTO scene_plans
                (scene_id,story_id,shot,lighting,mood,direction,
                 visible_character_ids,reference_character_id,revision,updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(scene_id) DO UPDATE SET
                   shot=excluded.shot,lighting=excluded.lighting,
                   mood=excluded.mood,direction=excluded.direction,
                   visible_character_ids=excluded.visible_character_ids,
                   reference_character_id=excluded.reference_character_id,
                   revision=scene_plans.revision+1,updated_at=excluded.updated_at""",
                (scene["id"], story_id, form.shot, form.lighting,
                 form.mood.strip(), form.direction.strip(), json.dumps(ids),
                 focus, 1, time.time()))
        return self.read(story_id)

    def selected_cast(self, story_id: str, prompt: str) -> list[dict]:
        """Explicit saved cast takes precedence over name detection."""
        characters = self.visual.characters(story_id)
        plan = self.read(story_id)
        if plan["revision"]:
            selected = set(plan["visible_character_ids"])
            return [person for person in characters if person["id"] in selected]
        return [person for person in characters if re.search(
            r"(?<!\w)" + re.escape(person["name"]) + r"(?!\w)", prompt, re.IGNORECASE)]

    def prompt(self, story_id: str, prompt: str) -> str:
        plan = self.read(story_id)
        if not plan["revision"]:
            return self.visual.enriched_prompt(story_id, prompt)
        scene = self.visual.scene(story_id)
        cast = self.selected_cast(story_id, prompt)
        lines = [
            f"Scene location: {scene['location']}.",
            "Shot: " + SHOT_LABELS[plan["shot"]] + ".",
            "Lighting: " + LIGHT_LABELS[plan["lighting"]] + ".",
        ]
        if plan["mood"]:
            lines.append("Mood: " + plan["mood"] + ".")
        if plan["direction"]:
            lines.append("Composition and action: " + plan["direction"] + ".")
        if cast:
            lines.append("Present characters (" + str(len(cast)) +
                         ", do not invent additional characters):")
            lines.extend(f"{row['name']}: {row['appearance']}; "
                         f"outfit: {row['outfit']}; features: "
                         f"{row['distinguishing_features']}" for row in cast)
        else:
            lines.append("No present characters specified.")
        identity = self.visual.creator_visual_identity_lines(
            story_id, prompt, {row["id"] for row in cast})
        if identity:
            lines.append("Creator visual identity tags:")
            lines.extend(identity)
        lines.append("Visual request: " + prompt.strip())
        return "\n".join(lines)

    def automatic_reference(self, story_id: str) -> str | None:
        plan = self.read(story_id)
        if not plan["revision"] or not plan["reference_character_id"]:
            return None
        focus = plan["reference_character_id"]
        for person in self.visual.characters(story_id):
            if person["id"] == focus:
                # Without an assigned image, the plan is still valid as text.
                return person.get("reference_asset_id")
        return None

    def clone(self, source: str, target: str,
              scene_ids: dict[str, str], character_ids: dict[str, str],
              historical_plans: list[dict] | None = None, conn=None) -> None:
        with (nullcontext(conn) if conn is not None else self.visual.store._conn()) as db:
            plans = (historical_plans if historical_plans is not None else
                     [dict(row) for row in db.execute(
                         "SELECT * FROM scene_plans WHERE story_id=?", (source,))])
            import json
            for item in plans:
                if item["scene_id"] not in scene_ids:
                    continue
                cast = [character_ids[c] for c in json.loads(item["visible_character_ids"])
                        if c in character_ids]
                focus = character_ids.get(item["reference_character_id"])
                if focus not in cast:
                    focus = None
                db.execute("""INSERT INTO scene_plans VALUES(?,?,?,?,?,?,?,?,?,?)""",
                           (scene_ids[item["scene_id"]], target,
                            item["shot"], item["lighting"], item["mood"],
                            item["direction"], json.dumps(cast), focus,
                            item["revision"], time.time()))


def mount_scene_plan_routes(app, planner: ScenePlanner):
    @app.get("/api/v1/stories/{story_id}/scene-plan")
    def read_scene_plan(story_id: uuid.UUID):
        try:
            return planner.read(str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/scene-plan")
    def save_scene_plan(story_id: uuid.UUID, body: ScenePlanInput):
        try:
            return planner.save(str(story_id), body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/scene-plan/preview")
    def preview_scene_plan(story_id: uuid.UUID, body: dict):
        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not 8 <= len(prompt) <= 2400:
            raise HTTPException(422, "Describe the scene in 8–2,400 characters")
        try:
            plan = planner.read(str(story_id))
            return {"prompt": planner.prompt(str(story_id), prompt),
                    "scene_id": plan["scene_id"], "revision": plan["revision"],
                    "inference_used": False,
                    "reference_asset_id": planner.automatic_reference(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
