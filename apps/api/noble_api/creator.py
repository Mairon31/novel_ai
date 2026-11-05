"""Authoring data separated from gameplay for Noble AI Story Creator.

Creator fields mirror distinct *purposes* (player synopsis, AI world context,
narrative guidance, reminder, opening scenarios), not proprietary Isekai text.
Everything is local/private until Noble AI has identity and sharing controls.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

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


class CreatorCharacter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=20, max_length=3000)
    personality: str = Field(default="", max_length=1500)
    dialogue_examples: str = Field(default="", max_length=3000)
    visual_character_id: uuid.UUID | None = None
    voice_id: str = Field(default="", max_length=180)


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
            """)

    def exists(self, story_id: str) -> bool:
        return self.narrative.get_story(story_id) is not None

    def get(self, story_id: str) -> dict:
        if not self.exists(story_id):
            raise ValueError("Historia inexistente")
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
            raise ValueError("Idioma de la historia no admitido")
        scenarios = [text.strip() for text in body.opening_scenarios]
        if any(len(text)<15 or len(text)>3000 for text in scenarios):
            raise ValueError("Cada inicio necesita entre 15 y 3000 caracteres")
        if len(set(x.casefold() for x in body.tags)) != len(body.tags):
            raise ValueError("No repitas etiquetas")
        if any(not 2<=len(tag.strip())<=35 for tag in body.tags):
            raise ValueError("Las etiquetas necesitan entre 2 y 35 caracteres")
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
                 **json.loads(row["config_json"]),"updated_at":row["updated_at"]}
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
                raise ValueError("La ficha visual no pertenece a esta historia")
        now=time.time()
        ident=character_id or str(uuid.uuid4())
        with self.store._conn() as db:
            if character_id:
                existing=db.execute("""SELECT id FROM creator_characters
                    WHERE id=? AND story_id=?""",(ident,story_id)).fetchone()
                if not existing:
                    raise ValueError("Personaje narrativo inexistente")
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
        name=story.get("protagonist_name") or "Protagonista"
        replace=lambda text: text.replace("{{user}}",name)
        chunks=[]
        if data["ai_plot"].strip():
            chunks.append("Contexto interno de la historia (hechos y reglas):\n"+
                          replace(data["ai_plot"][:12000]))
        if data["guidelines"].strip():
            chunks.append("Directrices de narración (estilo, ritmo, límites del narrador):\n"+
                          replace(data["guidelines"][:4000]))
        if npc:
            lines=[]
            for character in npc[:30]:
                lines.append("Personaje: "+character["name"]+"\nDescripción: "+
                             replace(character["description"])+"\nPersonalidad: "+
                             replace(character["personality"])+"\nEjemplos de diálogo: "+
                             replace(character["dialogue_examples"]))
            chunks.append("NPC controlados por el narrador:\n"+"\n\n".join(lines))
        if data["reminder"].strip():
            chunks.append("Recordatorio persistente del creador:\n"+
                          replace(data["reminder"][:1200]))
        return "\n\n".join(chunks)[:30000]

    def opening(self, story_id: str, index: int) -> dict:
        info=self.get(story_id)
        scenarios=info["opening_scenarios"]
        if index>=len(scenarios):
            raise ValueError("Inicio no encontrado")
        if self.narrative.turns(story_id,limit=1):
            raise ValueError("La historia ya comenzó: no se puede sustituir el inicio")
        name=self.narrative.get_story(story_id).get("protagonist_name","Protagonista")
        content=scenarios[index].replace("{{user}}",name)
        return self.narrative.append(story_id,str(uuid.uuid4()),"story","",
                                     content,"inicio-del-creador")

    def clone(self, source_id: str, target_id: str, character_ids: dict | None = None) -> dict[str, str]:
        with self.store._conn() as db:
            blueprint=db.execute("""SELECT config_json FROM creator_blueprints
                WHERE story_id=?""",(source_id,)).fetchone()
            characters=[dict(x) for x in db.execute("""SELECT id,config_json
                FROM creator_characters WHERE story_id=?""",(source_id,))]
            npc_map: dict[str,str] = {}
            now=time.time()
            if blueprint:
                db.execute("INSERT INTO creator_blueprints VALUES(?,?,?)",
                           (target_id,blueprint["config_json"],now))
            for item in characters:
                config=json.loads(item["config_json"])
                previous=config.get("visual_character_id")
                config["visual_character_id"]=(character_ids or {}).get(previous)
                cloned_id = str(uuid.uuid4())
                npc_map[item["id"]] = cloned_id
                db.execute("INSERT INTO creator_characters VALUES(?,?,?,?,?)",
                           (cloned_id,target_id,json.dumps(config),now,now))
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
