"""Local author-controlled Lorebooks with bounded, deterministic activation.

Only explicit user-authored entries are stored. No model is asked to generate
memory, and no arbitrary regex or Python evaluation runs from an entry.
Entries are scoped to a single story; branches copy them into independent rows.
"""
from __future__ import annotations

import json
from contextlib import nullcontext
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
    # Legacy entries remain world-visible. Private entries require explicit
    # witnesses to be physically present in the confirmed world state.
    visibility: Literal["world", "witnesses"] = "world"
    witness_character_ids: list[uuid.UUID] = Field(default_factory=list, max_length=16)


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
                CREATE TABLE IF NOT EXISTS lorebook_turn_snapshots(
                    turn_id TEXT PRIMARY KEY REFERENCES story_turns(id) ON DELETE CASCADE,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    entries_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_lorebook_turn_history
                    ON lorebook_turn_snapshots(story_id,created_at,turn_id);
            """)

    def _check_story(self, story_id: str) -> None:
        if self.narrative.get_story(story_id) is None:
            raise ValueError("Story not found")

    @staticmethod
    def _clean(body: LorebookEntryInput) -> dict:
        payload = body.model_dump(mode="json")
        payload["title"] = body.title.strip()
        payload["content"] = body.content.strip()
        if len(payload["title"]) < 2 or len(payload["content"]) < 10:
            raise ValueError("Lorebook title and content cannot be empty")
        for field in ("keys", "secondary_keys"):
            cleaned = [value.strip() for value in payload[field]]
            if any(not 2 <= len(value) <= 80 for value in cleaned):
                raise ValueError("Each trigger word must contain 2–80 characters")
            if len({value.casefold() for value in cleaned}) != len(cleaned):
                raise ValueError("Duplicate trigger words are not allowed")
            payload[field] = cleaned
        if not body.always_active and not payload["keys"]:
            raise ValueError("Define palabras activadoras o marca Siempre activo")
        witnesses = payload["witness_character_ids"]
        if len(witnesses) != len(set(witnesses)):
            raise ValueError("Lorebook witnesses cannot be duplicated")
        if payload["visibility"] == "witnesses":
            if not witnesses:
                raise ValueError("A private entry requires characters who know it")
        elif witnesses:
            raise ValueError("General knowledge must not have private witnesses")
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
            db.execute("BEGIN IMMEDIATE")
            if payload["visibility"] == "witnesses":
                owned = {row["id"] for row in db.execute(
                    "SELECT id FROM creator_characters WHERE story_id=?", (story_id,)
                )}
                if not set(payload["witness_character_ids"]).issubset(owned):
                    raise ValueError("Witnesses must belong to this story")
            if entry_id:
                updated = db.execute(
                    "UPDATE lorebook_entries SET entry_json=?,updated_at=? "
                    "WHERE id=? AND story_id=?",
                    (json.dumps(payload, ensure_ascii=False), now, entry_id, story_id),
                )
                if updated.rowcount != 1:
                    raise ValueError("Lorebook entry not found in this story")
                ident = entry_id
            else:
                total = db.execute(
                    "SELECT COUNT(*) FROM lorebook_entries WHERE story_id=?",
                    (story_id,)
                ).fetchone()[0]
                if total >= self.MAX_ENTRIES:
                    raise ValueError("Maximum 200 entries per story")
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
                raise ValueError("Lorebook entry not found in this story")

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
        current = self.entries(story_id)
        # A private Lorebook is NOT general narrator knowledge: merely
        # mentioning a name/keyword never makes a witness present.
        world = self.narrative.world
        confirmed_presence = (
            set(world.current(story_id)["state"]["present_character_ids"])
            if world is not None else set()
        )
        owner = self.narrative.get_story(story_id)
        protagonist_name = owner.get("protagonist_name") or "Protagonist"
        ordered = sorted(
            current,
            key=lambda entry: (-entry["priority"], entry["created_at"], entry["id"]),
        )
        chosen: list[dict] = []
        skipped = 0
        skipped_visibility = 0
        used = 0
        for entry in ordered:
            if not entry["enabled"]:
                continue
            if entry.get("visibility", "world") == "witnesses":
                witness_ids = set(entry.get("witness_character_ids") or ())
                if not witness_ids or not witness_ids.intersection(confirmed_presence):
                    skipped_visibility += 1
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
            text = ("[Lorebook: " + entry["title"] + "]\n" +
                    entry["content"].replace("{{user}}", protagonist_name))
            if entry.get("visibility", "world") == "witnesses":
                visible_ids = set(entry["witness_character_ids"]) & confirmed_presence
                # Identify whose knowledge is available, not who is absent.
                with self.store._conn() as db:
                    names = [json.loads(row["config_json"]).get("name", "NPC")
                             for row in db.execute(
                                 "SELECT id,config_json FROM creator_characters "
                                 "WHERE story_id=?", (story_id,)
                             ) if row["id"] in visible_ids]
                text = ("[Private knowledge of present characters: " +
                        ", ".join(names) + "]\n" + text)
            cost = len(text) + 2
            if used + cost > budget_chars:
                skipped += 1
                continue
            used += cost
            chosen.append({"id": entry["id"], "title": entry["title"],
                           "priority": entry["priority"], "content": text,
                           "visibility": entry.get("visibility", "world")})
        return {
            "entries": chosen, "used_chars": used, "budget_chars": budget_chars,
            "skipped_budget": skipped, "skipped_visibility": skipped_visibility,
            "context": "\n\n".join(entry["content"] for entry in chosen),
        }

    @staticmethod
    def _snapshot_rows(db, story_id: str) -> list[dict]:
        """Read exact current author data through the caller's transaction."""
        return [dict(row) for row in db.execute(
            "SELECT id,entry_json,created_at,updated_at "
            "FROM lorebook_entries WHERE story_id=? ORDER BY created_at,id",
            (story_id,)
        )]

    def snapshot_turn_in_transaction(
        self, db, story_id: str, turn_id: str, created_at: float
    ) -> None:
        """Save what actually existed when the turn committed.

        Later edits/deletions do not rewrite these immutable checkpoints.
        This must run inside the same transaction as story_turns and world state.
        """
        entries = self._snapshot_rows(db, story_id)
        db.execute(
            "INSERT INTO lorebook_turn_snapshots"
            "(turn_id,story_id,entries_json,created_at) VALUES (?,?,?,?)",
            (turn_id, story_id, json.dumps(entries, ensure_ascii=False), created_at),
        )

    def snapshot(self, story_id: str, turn_id: str) -> dict:
        self._check_story(story_id)
        with self.store._conn() as db:
            row = db.execute(
                "SELECT entries_json,created_at FROM lorebook_turn_snapshots "
                "WHERE story_id=? AND turn_id=?", (story_id, turn_id)
            ).fetchone()
        if row is None:
            raise ValueError("No Lorebook snapshot for that turn")
        entries = json.loads(row["entries_json"])
        return {
            "story_id": story_id, "turn_id": turn_id,
            "created_at": row["created_at"], "entries": [
                {"id": entry["id"], "story_id": story_id,
                 **json.loads(entry["entry_json"]),
                 "created_at": entry["created_at"],
                 "updated_at": entry["updated_at"]}
                for entry in entries
            ],
        }

    def clone(
        self, source_id: str, target_id: str,
        turn_map: dict[str, str] | None = None,
        until_turn_id: str | None = None,
        character_ids: dict[str, str] | None = None, conn=None,
    ) -> None:
        """Restore the selected turn's Lorebook, never the source future.

        Cloned entries keep stable NEW IDs across copied snapshots and current
        rows. Existing turns before this feature lack history: a partial fork
        of such a turn starts with an empty Lorebook, rather than leaking the
        original's present-day secrets. Full forks keep the current Lorebook.
        """
        with (nullcontext(conn) if conn is not None else self.store._conn()) as db:
            history = {
                row["turn_id"]: json.loads(row["entries_json"])
                for row in db.execute(
                    "SELECT turn_id,entries_json FROM lorebook_turn_snapshots "
                    "WHERE story_id=?", (source_id,)
                )
            }
            entry_map: dict[str, str] = {}

            def remap(rows: list[dict]) -> list[dict]:
                result = []
                for entry in rows:
                    old_id = entry["id"]
                    clone = dict(entry)
                    payload = json.loads(clone["entry_json"])
                    if payload.get("visibility", "world") == "witnesses":
                        # No future/foreign NPC IDs may survive into a branch.
                        mapped = [character_ids[ident]
                                  for ident in payload.get("witness_character_ids", [])
                                  if character_ids and ident in character_ids]
                        if not mapped:
                            continue  # Fail closed: no owned witness was copied.
                        payload["witness_character_ids"] = mapped
                        clone["entry_json"] = json.dumps(payload, ensure_ascii=False)
                    clone["id"] = entry_map.setdefault(old_id, str(uuid.uuid4()))
                    result.append(clone)
                return result

            if turn_map:
                for source_turn, branch_turn in turn_map.items():
                    entries = history.get(source_turn)
                    if entries is None:
                        continue  # Do not fabricate history for pre-feature turns.
                    source_timestamp = db.execute(
                        "SELECT created_at FROM story_turns WHERE id=? AND story_id=?",
                        (source_turn, source_id)
                    ).fetchone()
                    db.execute(
                        "INSERT INTO lorebook_turn_snapshots"
                        "(turn_id,story_id,entries_json,created_at) VALUES (?,?,?,?)",
                        (branch_turn, target_id,
                         json.dumps(remap(entries), ensure_ascii=False),
                         source_timestamp["created_at"]),
                    )
            if until_turn_id is not None:
                selected = history.get(until_turn_id, [])
            else:
                selected = self._snapshot_rows(db, source_id)
            now = time.time()
            for index, entry in enumerate(remap(selected)):
                db.execute(
                    "INSERT INTO lorebook_entries"
                    "(id,story_id,entry_json,created_at,updated_at) "
                    "VALUES (?,?,?,?,?)",
                    (entry["id"], target_id, entry["entry_json"],
                     now + index * 0.000001, now),
                )


def mount_lorebook_routes(app, lorebook: LorebookService) -> None:
    @app.get("/api/v1/stories/{story_id}/lorebook")
    def list_entries(story_id: uuid.UUID):
        try:
            return {"entries": lorebook.entries(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/lorebook/turns/{turn_id}")
    def historical_entries(story_id: uuid.UUID, turn_id: uuid.UUID):
        try:
            return lorebook.snapshot(str(story_id), str(turn_id))
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
