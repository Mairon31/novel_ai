"""Bounded, story-scoped episodic search over player-authored turns.

The index intentionally contains only user actions/dialogue, never generated
assistant narration or private author lore. Matching a remote event therefore
cannot promote an AI-generated secret to canon or give absent NPCs knowledge.
SQLite FTS5 is optional: a bounded lexical fallback remains available.
"""
from __future__ import annotations

import re
import sqlite3
from fastapi import HTTPException, Query
import uuid


_STOP = {"que", "una", "uno", "por", "para", "con", "del", "los", "las",
         "the", "and", "from", "this", "ese", "esa", "como", "sobre",
         "quiero", "hago", "estoy", "hasta", "donde", "cuando", "cómo"}
_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)


class EpisodicMemory:
    def __init__(self, narrative):
        self.narrative = narrative
        self.store = narrative.store
        self.fts_enabled = False
        with self.store._conn() as db:
            try:
                db.execute(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS narrative_turn_fts USING fts5("
                    "turn_id UNINDEXED, story_id UNINDEXED, mode UNINDEXED, "
                    "input_text, tokenize='unicode61 remove_diacritics 2')"
                )
                self.fts_enabled = True
                # Upgrade from pre-index versions without rewriting the stories
                # or inventing summaries. Existing FTS rows are not duplicated.
                db.execute(
                    "INSERT INTO narrative_turn_fts(turn_id,story_id,mode,input_text) "
                    "SELECT t.id,t.story_id,t.mode,t.input_text FROM story_turns t "
                    "WHERE length(trim(t.input_text))>0 AND NOT EXISTS ("
                    "SELECT 1 FROM narrative_turn_fts f WHERE f.turn_id=t.id)"
                )
            except sqlite3.OperationalError as exc:
                if "fts5" not in str(exc).lower() and "no such module" not in str(exc).lower():
                    raise
                self.fts_enabled = False

    @staticmethod
    def terms(query: str) -> list[str]:
        # FTS syntax is never accepted from the caller. All matches are quoted,
        # bounded individual Unicode words, not arbitrary SQL/FTS expressions.
        unique = []
        for raw in _TOKEN.findall(query.casefold()[-500:]):
            term = raw[:48]
            if len(term) < 3 or term in _STOP or term in unique:
                continue
            unique.append(term)
            if len(unique) == 8:
                break
        return unique

    def index_turn_in_transaction(self, db, turn: dict) -> None:
        if self.fts_enabled and turn["input_text"].strip():
            db.execute(
                "INSERT INTO narrative_turn_fts(turn_id,story_id,mode,input_text) "
                "VALUES (?,?,?,?)",
                (turn["id"], turn["story_id"], turn["mode"], turn["input_text"]))

    def index_branch_in_transaction(self, db, source_turns: list[dict],
                                    target_story: str, turn_map: dict[str, str]) -> None:
        if not self.fts_enabled:
            return
        for turn in source_turns:
            if turn["input_text"].strip():
                db.execute(
                    "INSERT INTO narrative_turn_fts(turn_id,story_id,mode,input_text) "
                    "VALUES (?,?,?,?)",
                    (turn_map[turn["id"]], target_story,
                     turn["mode"], turn["input_text"]))

    def search(self, story_id: str, query: str, limit: int = 6,
               exclude_turn_ids: set[str] | None = None) -> dict:
        if self.narrative.get_story(story_id) is None:
            raise ValueError("Historia inexistente")
        limit = max(1, min(limit, 12))
        words = self.terms(query)
        if not words:
            return {"episodes": [], "fts5": self.fts_enabled, "source": "player_input"}
        excluded = exclude_turn_ids or set()
        candidates = []
        with self.store._conn() as db:
            if self.fts_enabled:
                # Match is composed exclusively of quoted bounded lexical
                # tokens. Joining OR is intentional: rank rewards more overlap.
                expression = " OR ".join('"' + word.replace('"', '') + '"'
                                         for word in words)
                try:
                    candidates = [dict(row) for row in db.execute(
                        "SELECT t.id,t.story_id,t.mode,t.input_text,t.created_at "
                        "FROM narrative_turn_fts f JOIN story_turns t ON t.id=f.turn_id "
                        "WHERE narrative_turn_fts MATCH ? AND f.story_id=? "
                        "ORDER BY bm25(narrative_turn_fts),t.created_at DESC LIMIT 80",
                        (expression, story_id))]
                except sqlite3.OperationalError as exc:
                    # A runtime with a disabled FTS extension can still read
                    # the same permanent SQLite data lexically.
                    if "fts5" not in str(exc).lower() and "no such" not in str(exc).lower():
                        raise
                    candidates = []
            if not self.fts_enabled or not candidates:
                candidates = [dict(row) for row in db.execute(
                    "SELECT id,story_id,mode,input_text,created_at "
                    "FROM story_turns WHERE story_id=? AND length(trim(input_text))>0 "
                    "ORDER BY created_at DESC,id DESC LIMIT 2500", (story_id,))]
        ranked = []
        for item in candidates:
            if item["id"] in excluded:
                continue
            content = item["input_text"].casefold()
            hits = sum(1 for term in words if term in content)
            if not hits:
                continue
            ranked.append((hits, item["created_at"], item))
        ranked.sort(key=lambda entry: (-entry[0], -entry[1], entry[2]["id"]))
        episodes = []
        for score, _, turn in ranked[:limit]:
            episodes.append({
                "turn_id": turn["id"], "story_id": turn["story_id"],
                "mode": turn["mode"], "input_text": turn["input_text"][:500],
                "created_at": turn["created_at"], "matched_terms": score,
            })
        return {"episodes": episodes, "fts5": self.fts_enabled,
                "source": "player_input"}


def mount_episodic_routes(app, memory: EpisodicMemory) -> None:
    @app.get("/api/v1/stories/{story_id}/memory/search")
    def search_episodic(story_id: uuid.UUID, q: str = Query(min_length=2, max_length=500),
                        limit: int = Query(6, ge=1, le=12)):
        try:
            return memory.search(str(story_id), q, limit)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
