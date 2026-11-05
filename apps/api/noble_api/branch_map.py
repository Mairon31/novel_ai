"""Read-only connected branch tree; navigation never mutates history."""
from __future__ import annotations

import uuid
from fastapi import HTTPException

from .story_archive import _family


def branch_tree(narrative, story_id: str) -> dict:
    with narrative.store._conn() as db:
        members = _family(db, story_id)
        ids = [row["id"] for row in members]
        placeholders = ",".join("?" for _ in ids)
        counts = {row["story_id"]: row["total"] for row in db.execute(
            "SELECT story_id, COUNT(*) AS total FROM story_turns "
            "WHERE story_id IN (" + placeholders + ") GROUP BY story_id",
            ids)}
    levels = {}
    result = []
    for story in members:
        parent = story.get("origin_story_id")
        levels[story["id"]] = levels.get(parent, -1) + 1
        result.append({
            "id": story["id"], "title": story["title"],
            "protagonist_name": story["protagonist_name"],
            "origin_story_id": parent,
            "origin_turn_id": story.get("origin_turn_id"),
            "depth": levels[story["id"]], "turn_count": counts.get(story["id"], 0),
            "created_at": story["created_at"], "updated_at": story["updated_at"],
            "is_selected": story["id"] == story_id,
        })
    return {"root_story_id": members[0]["id"],
            "selected_story_id": story_id, "branches": result}


def mount_branch_routes(app, narrative) -> None:
    @app.get("/api/v1/stories/{story_id}/branches")
    def get_branches(story_id: uuid.UUID):
        try:
            return branch_tree(narrative, str(story_id))
        except ValueError as exc:
            raise HTTPException(404 if "inexistente" in str(exc) else 422,
                                str(exc)) from exc
