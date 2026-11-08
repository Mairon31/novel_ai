"""Authoring data separated from gameplay for Noble AI Story Creator.

Creator fields mirror distinct *purposes* (player synopsis, AI world context,
narrative guidance, reminder, opening scenarios), not proprietary Isekai text.
Everything is local/private until Noble AI has identity and sharing controls.
"""
from __future__ import annotations

import json
import re
from contextlib import nullcontext
import sqlite3
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Literal

from .narrative import NarrativeService


class CreatorBlueprint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    synopsis: str = Field(default="", max_length=250)
    player_plot: str = Field(default="", max_length=4000)
    ai_plot: str = Field(default="", max_length=12000)
    guidelines: str = Field(default="", max_length=4000)
    reminder: str = Field(default="", max_length=1200)
    opening_scenarios: list[str] = Field(default_factory=list, max_length=6)
    genre: str = Field(default="", max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=12)
    language: str = "es-419"
    # Legacy projects continue in text mode unless the author opts in.
    visual_start: Literal["text", "cover_background", "cover_background_cast"] = "text"


class VisualDNA(BaseModel):
    """Canonical identity metadata, never mixed with narrator personality."""
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = Field(default_factory=list, max_length=16)
    seed: int | None = Field(default=None, ge=0, le=4294967295)
    lora_name: str | None = Field(default=None, max_length=160)
    lora_strength: float = Field(default=0.8, ge=0.0, le=2.0)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        tags = [value.strip() for value in values]
        if any(not 2 <= len(tag) <= 64 or
               any(ord(c) < 32 or ord(c) == 127 for c in tag) for tag in tags):
            raise ValueError("Each visual tag must contain 2–64 visible characters")
        if len({tag.casefold() for tag in tags}) != len(tags):
            raise ValueError("Do not repeat visual tags")
        return tags

    @field_validator("lora_name")
    @classmethod
    def check_lora(cls, name: str | None) -> str | None:
        if not name:
            return None
        # Metadata only. Never accept filesystem paths or download URLs here.
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,146}\.safetensors", name):
            raise ValueError("LoRA must be a .safetensors filename without a path")
        return name


class CreatorCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=20, max_length=3000)
    personality: str = Field(default="", max_length=1500)
    dialogue_examples: str = Field(default="", max_length=3000)
    visual_character_id: uuid.UUID | None = None
    voice_id: str = Field(default="", max_length=180)
    visual_dna: VisualDNA = Field(default_factory=VisualDNA)


class OpeningSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    index: int = Field(ge=0, le=5)


class CreatorService:
    def __init__(self, narrative: NarrativeService):
        self.narrative = narrative
        self.store = narrative.store
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS creator_blueprints(
                    story_id TEXT PRIMARY KEY, config_json TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS creator_characters(
                    id TEXT PRIMARY KEY,story_id TEXT NOT NULL,
                    config_json TEXT NOT NULL,created_at REAL NOT NULL,updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS creator_characters_story
                    ON creator_characters(story_id,updated_at);
                CREATE TABLE IF NOT EXISTS creator_turn_snapshots(
                    turn_id TEXT PRIMARY KEY REFERENCES story_turns(id) ON DELETE CASCADE,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    blueprint_json TEXT,
                    characters_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_creator_turn_snapshots
                    ON creator_turn_snapshots(story_id,created_at,turn_id);
            """)

    def exists(self, story_id: str) -> bool:
        return self.narrative.get_story(story_id) is not None

    def get(self, story_id: str) -> dict:
        if not self.exists(story_id):
            raise ValueError("Story not found")
        with self.store._conn() as db:
            row = db.execute("SELECT config_json,updated_at FROM creator_blueprints WHERE story_id=?",
                             (story_id,)).fetchone()
        if row:
            return {"story_id":story_id,**json.loads(row["config_json"]),
                    "updated_at":row["updated_at"]}
        return {"story_id":story_id,**CreatorBlueprint().model_dump(),"updated_at":None}

    def save(self, story_id: str, body: CreatorBlueprint) -> dict:
        self.get(story_id)
        if body.language not in ("es-419","en","ja","ko","pt-BR","fr"):
            raise ValueError("Unsupported story language")
        scenarios = [text.strip() for text in body.opening_scenarios]
        if any(len(text)<15 or len(text)>3000 for text in scenarios):
            raise ValueError("Each opening must contain 15–3,000 characters")
        if len(set(x.casefold() for x in body.tags)) != len(body.tags):
            raise ValueError("Do not repeat tags")
        if any(not 2<=len(tag.strip())<=35 for tag in body.tags):
            raise ValueError("Tags must contain 2–35 characters")
        form = body.model_copy(update={
            "opening_scenarios":scenarios,
            "tags":[tag.strip() for tag in body.tags],
        })
        now=time.time()
        with self.store._conn() as db:
            db.execute("""INSERT INTO creator_blueprints VALUES(?,?,?)
                ON CONFLICT(story_id) DO UPDATE SET config_json=excluded.config_json,
                updated_at=excluded.updated_at""",
                (story_id,form.model_dump_json(),now))
        return self.get(story_id)

    def characters(self, story_id: str) -> list[dict]:
        self.get(story_id)
        with self.store._conn() as db:
            data=db.execute("""SELECT * FROM creator_characters
                WHERE story_id=? ORDER BY created_at,id""",(story_id,)).fetchall()
        return [{"id":row["id"],"story_id":story_id,
                 **CreatorCharacter.model_validate_json(row["config_json"]).model_dump(mode="json"),
                 "updated_at":row["updated_at"]}
                for row in data]

    def put_character(self, story_id: str, body: CreatorCharacter,
                      character_id: str | None = None) -> dict:
        self.get(story_id)
        if body.visual_character_id is not None:
            with self.store._conn() as db:
                match=db.execute("""SELECT id FROM visual_characters
                    WHERE id=? AND story_id=?""",
                    (str(body.visual_character_id),story_id)).fetchone()
            if not match:
                raise ValueError("Visual profile does not belong to this story")
        now=time.time()
        ident=character_id or str(uuid.uuid4())
        with self.store._conn() as db:
            if character_id:
                existing=db.execute("""SELECT config_json FROM creator_characters
                    WHERE id=? AND story_id=?""",(ident,story_id)).fetchone()
                if not existing:
                    raise ValueError("Narrative character not found")
                old = CreatorCharacter.model_validate_json(existing["config_json"])
                # Older clients can update narrative text without clearing an existing DNA.
                if "visual_dna" not in body.model_fields_set:
                    body = body.model_copy(update={"visual_dna": old.visual_dna})
                if (old.visual_dna.tags and
                        body.visual_dna.tags != old.visual_dna.tags):
                    raise ValueError("Visual identity tags are already locked")
                if (old.visual_dna.seed is not None and
                        body.visual_dna.seed != old.visual_dna.seed):
                    raise ValueError("Visual seed is already locked")
                db.execute("""UPDATE creator_characters SET config_json=?,updated_at=?
                    WHERE id=? AND story_id=?""",
                    (body.model_dump_json(),now,ident,story_id))
            else:
                db.execute("INSERT INTO creator_characters VALUES(?,?,?,?,?)",
                           (ident,story_id,body.model_dump_json(),now,now))
        return next(row for row in self.characters(story_id) if row["id"]==ident)

    def context(self, story: dict) -> str:
        """World bible and character voices are explicit and reviewed by author."""
        data=self.get(story["id"])
        npc=self.characters(story["id"])
        name=story.get("protagonist_name") or "Protagonist"
        replace=lambda text: text.replace("{{user}}",name)
        chunks=[]
        if data["ai_plot"].strip():
            chunks.append("Private story context (facts and rules):\n"+
                          replace(data["ai_plot"][:12000]))
        if data["guidelines"].strip():
            chunks.append("Narration guidelines (style, pace, narrator boundaries):\n"+
                          replace(data["guidelines"][:4000]))
        if npc:
            lines=[]
            for character in npc[:30]:
                lines.append("Character: "+character["name"]+"\nDescription: "+
                             replace(character["description"])+"\nPersonality: "+
                             replace(character["personality"])+"\nDialogue examples: "+
                             replace(character["dialogue_examples"]))
            chunks.append("Narrator-controlled NPCs:\n"+"\n\n".join(lines))
        if data["reminder"].strip():
            chunks.append("Persistent creator reminder:\n"+
                          replace(data["reminder"][:1200]))
        return "\n\n".join(chunks)[:30000]

    def opening(self, story_id: str, index: int) -> dict:
        info=self.get(story_id)
        scenarios=info["opening_scenarios"]
        if index>=len(scenarios):
            raise ValueError("Opening not found")
        if self.narrative.turns(story_id,limit=1):
            raise ValueError("The story has already started; its opening cannot be replaced")
        if self.narrative.visual_preflight is not None:
            self.narrative.visual_preflight.require_ready(story_id)
        name=self.narrative.get_story(story_id).get("protagonist_name","Protagonist")
        content=scenarios[index].replace("{{user}}",name)
        return self.narrative.append(story_id,str(uuid.uuid4()),"story","",
                                     content,"inicio-del-creador")

    @staticmethod
    def _state_in_transaction(db, story_id: str) -> tuple[str | None, list[dict]]:
        blueprint = db.execute(
            "SELECT config_json FROM creator_blueprints WHERE story_id=?",
            (story_id,)
        ).fetchone()
        chars = [dict(row) for row in db.execute(
            "SELECT id,config_json,created_at,updated_at "
            "FROM creator_characters WHERE story_id=? ORDER BY created_at,id",
            (story_id,)
        )]
        return blueprint["config_json"] if blueprint else None, chars

    def snapshot_turn_in_transaction(self, db, story_id: str,
                                     turn_id: str, created_at: float) -> None:
        """Checkpoint author instructions and character identities with the turn."""
        blueprint, characters = self._state_in_transaction(db, story_id)
        db.execute(
            "INSERT INTO creator_turn_snapshots"
            "(turn_id,story_id,blueprint_json,characters_json,created_at)"
            " VALUES (?,?,?,?,?)",
            (turn_id, story_id, blueprint,
             json.dumps(characters, ensure_ascii=False), created_at)
        )

    def clone(
        self, source_id: str, target_id: str,
        character_ids: dict | None = None,
        turn_map: dict[str, str] | None = None,
        until_turn_id: str | None = None,
        conn=None,
    ) -> dict[str, str]:
        """Fork author instructions and NPCs from exactly the selected moment.

        In old stories without snapshots, the safe fallback for partial forks
        is an empty author blueprint and no NPCs, rather than future spoilers.
        """
        with (nullcontext(conn) if conn is not None else self.store._conn()) as db:
            snapshots = {
                row["turn_id"]: row
                for row in db.execute(
                    "SELECT * FROM creator_turn_snapshots WHERE story_id=?", (source_id,)
                )
            }
            npc_map: dict[str, str] = {}
            now = time.time()

            def remap_characters(items: list[dict]) -> list[dict]:
                result = []
                for item in items:
                    config = json.loads(item["config_json"])
                    original_visual_id = config.get("visual_character_id")
                    config["visual_character_id"] = (character_ids or {}).get(
                        original_visual_id
                    )
                    converted = dict(item)
                    converted["id"] = npc_map.setdefault(item["id"], str(uuid.uuid4()))
                    converted["config_json"] = json.dumps(config, ensure_ascii=False)
                    result.append(converted)
                return result

            for old_turn_id, new_turn_id in (turn_map or {}).items():
                snap = snapshots.get(old_turn_id)
                if snap is None:
                    continue  # No guesswork for legacy turns without checkpoints.
                source_cast = json.loads(snap["characters_json"])
                db.execute(
                    "INSERT INTO creator_turn_snapshots"
                    "(turn_id,story_id,blueprint_json,characters_json,created_at)"
                    " VALUES (?,?,?,?,?)",
                    (new_turn_id, target_id, snap["blueprint_json"],
                     json.dumps(remap_characters(source_cast), ensure_ascii=False),
                     snap["created_at"])
                )

            if until_turn_id is None:
                blueprint, chosen_cast = self._state_in_transaction(db, source_id)
            else:
                cutoff = snapshots.get(until_turn_id)
                blueprint = cutoff["blueprint_json"] if cutoff else None
                chosen_cast = json.loads(cutoff["characters_json"]) if cutoff else []

            if blueprint:
                db.execute(
                    "INSERT INTO creator_blueprints VALUES(?,?,?)",
                    (target_id, blueprint, now)
                )
            for index, row in enumerate(remap_characters(chosen_cast)):
                db.execute(
                    "INSERT INTO creator_characters VALUES(?,?,?,?,?)",
                    (row["id"], target_id, row["config_json"],
                     now + index * 0.000001, now)
                )
        return npc_map



def mount_creator_routes(app, creator: CreatorService):
    @app.get("/api/v1/stories/{story_id}/creator")
    def get_creator(story_id: uuid.UUID):
        try:
            return creator.get(str(story_id))
        except ValueError as exc:
            raise HTTPException(404,str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/creator")
    def save_creator(story_id: uuid.UUID, body: CreatorBlueprint):
        try:
            return creator.save(str(story_id),body)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/creator/characters")
    def list_creator_characters(story_id: uuid.UUID):
        try:
            return {"characters":creator.characters(str(story_id))}
        except ValueError as exc:
            raise HTTPException(404,str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/characters",status_code=201)
    def create_creator_character(story_id: uuid.UUID, body: CreatorCharacter):
        try:
            return creator.put_character(str(story_id),body)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/creator/characters/{character_id}")
    def update_creator_character(story_id: uuid.UUID, character_id:uuid.UUID,
                                 body: CreatorCharacter):
        try:
            return creator.put_character(str(story_id),body,str(character_id))
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/creator/opening",status_code=201)
    def start_creator_opening(story_id:uuid.UUID, body:OpeningSelection):
        try:
            return creator.opening(str(story_id),body.index)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
