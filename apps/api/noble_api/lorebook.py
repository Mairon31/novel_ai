"""Local author-controlled Lorebooks with bounded, deterministic activation.

Only explicit user-authored entries are stored. No model is asked to generate
memory, and no arbitrary regex or Python evaluation runs from an entry.
Entries are scoped to a single story; branches copy them into independent rows.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class LorebookEntryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=100)
    content: str = Field(min_length=10, max_length=3500)
    keys: list[str] = Field(default_factory=list, max_length=12)
    secondary_keys: list[str] = Field(default_factory=list, max_length=8)
    secondary_mode: Literal["any", "all"] = "any"
    match_whole_words: bool = True
    priority: int = Field(default=50, ge=0, le=100)
    enabled: bool = True
    always_active: bool = False


class LorebookPreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(default="", max_length=3000)
    budget_chars: int = Field(default=6000, ge=512, le=6000)


class LorebookService:
    MAX_ENTRIES = 200

    def __init__(self, narrative):
        self.narrative = narrative
        self.store = narrative.store
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS lorebook_entries (
                    id TEXT PRIMARY KEY,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    entry_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_lorebook_by_story
                    ON lorebook_entries(story_id,created_at,id);
            """)

    def _check_story(self, story_id: str) -> None:
        if self.narrative.get_story(story_id) is None:
            raise ValueError("Historia inexistente")

    @staticmethod
    def _clean(body: LorebookEntryInput) -> dict:
        payload = body.model_dump()
        payload["title"] = body.title.strip()
        payload["content"] = body.content.strip()
        if len(payload["title"]) < 2 or len(payload["content"]) < 10:
            raise ValueError("El título y el contenido de Lorebook no pueden estar vacíos")
        for field in ("keys", "secondary_keys"):
            cleaned = [value.strip() for value in payload[field]]
            if any(not 2 <= len(value) <= 80 for value in cleaned):
                raise ValueError("Cada palabra activadora debe tener entre 2 y 80 caracteres")
            if len({value.casefold() for value in cleaned}) != len(cleaned):
                raise ValueError("No se admiten palabras activadoras duplicadas")
            payload[field] = cleaned
        if not body.always_active and not payload["keys"]:
            raise ValueError("Define palabras activadoras o marca Siempre activo")
        return payload

    def entries(self, story_id: str) -> list[dict]:
        self._check_story(story_id)
        with self.store._conn() as db:
            rows = db.execute(
                "SELECT * FROM lorebook_entries WHERE story_id=? "
                "ORDER BY created_at,id", (story_id,)
            ).fetchall()
        return [{"id": row["id"], "story_id": row["story_id"],
                 **json.loads(row["entry_json"]),
                 "created_at": row["created_at"], "updated_at": row["updated_at"]}
                for row in rows]

    def upsert(self, story_id: str, body: LorebookEntryInput,
               entry_id: str | None = None) -> dict:
        self._check_story(story_id)
        payload = self._clean(body)
        now = time.time()
        with self.store._conn() as db:
            if entry_id:
                updated = db.execute(
                    "UPDATE lorebook_entries SET entry_json=?,updated_at=? "
                    "WHERE id=? AND story_id=?",
                    (json.dumps(payload, ensure_ascii=False), now, entry_id, story_id),
                )
                if updated.rowcount != 1:
                    raise ValueError("Entrada de Lorebook inexistente en esta historia")
                ident = entry_id
            else:
                total = db.execute(
                    "SELECT COUNT(*) FROM lorebook_entries WHERE story_id=?",
                    (story_id,)
                ).fetchone()[0]
                if total >= self.MAX_ENTRIES:
                    raise ValueError("Máximo de 200 entradas por historia")
                ident = str(uuid.uuid4())
                db.execute(
                    "INSERT INTO lorebook_entries VALUES (?,?,?,?,?)",
                    (ident, story_id, json.dumps(payload, ensure_ascii=False), now, now),
                )
        return next(entry for entry in self.entries(story_id) if entry["id"] == ident)

    def delete(self, story_id: str, entry_id: str) -> None:
        self._check_story(story_id)
        with self.store._conn() as db:
            result = db.execute(
                "DELETE FROM lorebook_entries WHERE id=? AND story_id=?",
                (entry_id, story_id),
            )
            if result.rowcount != 1:
                raise ValueError("Entrada de Lorebook inexistente en esta historia")

    @staticmethod
    def _contains(text: str, needle: str, whole_words: bool) -> bool:
        key = needle.casefold()
        if not whole_words:
            return key in text
        # Escape every author-controlled key: regex source is never accepted.
        return re.search(r"(?<!\w)" + re.escape(key) + r"(?!\w)", text) is not None

    def activate(self, story_id: str, activation_text: str,
                 budget_chars: int = 6000) -> dict:
        budget_chars = max(512, min(budget_chars, 6000))
        searchable = activation_text[-12000:].casefold()
        ordered = sorted(
            self.entries(story_id),
            key=lambda entry: (-entry["priority"], entry["created_at"], entry["id"]),
        )
        chosen: list[dict] = []
        skipped = 0
        used = 0
        for entry in ordered:
            if not entry["enabled"]:
                continue
            if not entry["always_active"]:
                primary = any(self._contains(searchable, key, entry["match_whole_words"])
                              for key in entry["keys"])
                if not primary:
                    continue
                secondary = [
                    self._contains(searchable, key, entry["match_whole_words"])
                    for key in entry["secondary_keys"]
                ]
                if secondary:
                    satisfied = all(secondary) if entry["secondary_mode"] == "all" else any(secondary)
                    if not satisfied:
                        continue
            # Never truncate a fact mid-sentence. If this entry does not fit,
            # lower-priority but smaller entries can still use the remaining room.
            text = (f"[Lorebook: {entry['title']}]\n"
                    f"{entry['content'].replace('{{user}}', self.narrative.get_story(story_id).get('protagonist_name') or 'Protagonista')}")
            cost = len(text) + 2
            if used + cost > budget_chars:
                skipped += 1
                continue
            used += cost
            chosen.append({"id": entry["id"], "title": entry["title"],
                           "priority": entry["priority"], "content": text})
        return {
            "entries": chosen, "used_chars": used, "budget_chars": budget_chars,
            "skipped_budget": skipped,
            "context": "\n\n".join(entry["content"] for entry in chosen),
        }

    def clone(self, source_id: str, target_id: str) -> None:
        """Fork copies author facts; edits in either branch cannot leak."""
        with self.store._conn() as db:
            now = time.time()
            rows = db.execute(
                "SELECT entry_json FROM lorebook_entries WHERE story_id=? "
                "ORDER BY created_at,id", (source_id,)
            ).fetchall()
            for index, row in enumerate(rows):
                db.execute(
                    "INSERT INTO lorebook_entries VALUES (?,?,?,?,?)",
                    (str(uuid.uuid4()), target_id, row["entry_json"],
                     now + index * 0.000001, now),
                )


def mount_lorebook_routes(app, lorebook: LorebookService) -> None:
    @app.get("/api/v1/stories/{story_id}/lorebook")
    def list_entries(story_id: uuid.UUID):
        try:
            return {"entries": lorebook.entries(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/lorebook", status_code=201)
    def create_entry(story_id: uuid.UUID, body: LorebookEntryInput):
        try:
            return lorebook.upsert(str(story_id), body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/lorebook/preview")
    def preview_entries(story_id: uuid.UUID, body: LorebookPreviewInput):
        try:
            return lorebook.activate(str(story_id), body.query, body.budget_chars)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/lorebook/{entry_id}")
    def update_entry(story_id: uuid.UUID, entry_id: uuid.UUID,
                     body: LorebookEntryInput):
        try:
            return lorebook.upsert(str(story_id), body, str(entry_id))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.delete("/api/v1/stories/{story_id}/lorebook/{entry_id}", status_code=204)
    def remove_entry(story_id: uuid.UUID, entry_id: uuid.UUID):
        try:
            lorebook.delete(str(story_id), str(entry_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
