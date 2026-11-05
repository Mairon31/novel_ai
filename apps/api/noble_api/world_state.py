"""Versioned, author-confirmed world state with per-turn immutable snapshots.

The narrator cannot mutate this source of truth. It is saved only by explicit
author requests, committed with the narrative turn and copied at a fork
cutoff. Witness-filtered context omits private facts if their owners are not
in the scene; instructions alone cannot guarantee LLM compliance.
"""
from __future__ import annotations

import json
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class WorldFact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    text: str = Field(min_length=10, max_length=360)
    public: bool = False
    witness_character_ids: list[uuid.UUID] = Field(default_factory=list, max_length=16)


class WorldStateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(default="", max_length=200)
    time_of_day: str = Field(default="", max_length=80)
    weather: str = Field(default="", max_length=100)
    present_character_ids: list[uuid.UUID] = Field(default_factory=list, max_length=30)
    inventory: list[str] = Field(default_factory=list, max_length=60)
    relationships: dict[str, str] = Field(default_factory=dict)
    flags: dict[str, bool] = Field(default_factory=dict)
    facts: list[WorldFact] = Field(default_factory=list, max_length=120)


class WorldStateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    state: WorldStateInput


class WorldStateService:
    def __init__(self, narrative):
        self.narrative = narrative
        self.store = narrative.store
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS world_states(
                    story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
                    state_json TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS world_turn_snapshots(
                    turn_id TEXT PRIMARY KEY REFERENCES story_turns(id) ON DELETE CASCADE,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    state_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_world_snapshots_by_story
                    ON world_turn_snapshots(story_id,created_at);
                CREATE TABLE IF NOT EXISTS world_state_edits(
                    id TEXT PRIMARY KEY,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    revision INTEGER NOT NULL,
                    state_json TEXT NOT NULL,
                    updated_at REAL NOT NULL,
                    UNIQUE(story_id, revision)
                );
            """)

    @staticmethod
    def default() -> dict:
        return WorldStateInput().model_dump(mode="json")

    def _exists(self, story_id: str) -> None:
        if self.narrative.get_story(story_id) is None:
            raise ValueError("Historia inexistente")

    def current(self, story_id: str) -> dict:
        self._exists(story_id)
        with self.store._conn() as db:
            row = db.execute(
                "SELECT state_json,revision,updated_at FROM world_states WHERE story_id=?",
                (story_id,)
            ).fetchone()
        if not row:
            return {"story_id": story_id, "revision": 0, "updated_at": None,
                    "state": self.default()}
        return {"story_id": story_id, "revision": row["revision"],
                "updated_at": row["updated_at"],
                "state": json.loads(row["state_json"])}

    @staticmethod
    def _validate_state(state: WorldStateInput, owned_ids: set[str]) -> dict:
        result = state.model_dump(mode="json")
        for name in ("location", "time_of_day", "weather"):
            result[name] = result[name].strip()
        for name, values, length in (
            ("inventory", result["inventory"], 100),
        ):
            result[name] = [value.strip() for value in values]
            if any(not 1 <= len(value) <= length for value in result[name]):
                raise ValueError("El inventario contiene un elemento inválido")
            if len(set(v.casefold() for v in result[name])) != len(result[name]):
                raise ValueError("Elementos repetidos en el inventario")
        references = result["present_character_ids"]
        if len(set(references)) != len(references):
            raise ValueError("Personajes presentes duplicados")
        if len(result["relationships"]) > 30 or len(result["flags"]) > 60:
            raise ValueError("Demasiadas relaciones o indicadores de estado")
        for identity, relation in result["relationships"].items():
            try:
                clean_id = str(uuid.UUID(identity))
            except ValueError as exc:
                raise ValueError("Identificador de relación inválido") from exc
            if clean_id != identity or not 1 <= len(relation.strip()) <= 160:
                raise ValueError("Relación inválida")
        for name in result["flags"]:
            if not 1 <= len(name) <= 70 or not all(
                    char.isalnum() or char in "_-." for char in name):
                raise ValueError("El identificador del indicador es inválido")
        fact_ids: set[str] = set()
        for fact in result["facts"]:
            fact["text"] = fact["text"].strip()
            if len(fact["text"]) < 10:
                raise ValueError("Texto de hecho demasiado corto")
            if fact["id"] in fact_ids:
                raise ValueError("Hechos duplicados")
            fact_ids.add(fact["id"])
            if len(set(fact["witness_character_ids"])) != len(fact["witness_character_ids"]):
                raise ValueError("Testigos duplicados")
            if not fact["public"] and not fact["witness_character_ids"]:
                raise ValueError("Un hecho privado necesita testigos explícitos")
            references.extend(fact["witness_character_ids"])
        references.extend(result["relationships"])
        if not set(references).issubset(owned_ids):
            raise ValueError("Un personaje de este estado no pertenece a la historia")
        return result

    def save(self, story_id: str, body: WorldStateUpdate) -> dict:
        self._exists(story_id)
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            owned_ids = {r["id"] for r in db.execute(
                "SELECT id FROM creator_characters WHERE story_id=?", (story_id,)
            )}
            state = self._validate_state(body.state, owned_ids)
            prior = db.execute(
                "SELECT revision FROM world_states WHERE story_id=?", (story_id,)
            ).fetchone()
            revision = prior["revision"] if prior else 0
            if body.expected_revision != revision:
                raise ValueError("Conflicto de revisión: recarga el estado del mundo")
            next_revision = revision + 1
            now = time.time()
            data = json.dumps(state, ensure_ascii=False, sort_keys=True)
            db.execute(
                "INSERT INTO world_states VALUES (?,?,?,?) "
                "ON CONFLICT(story_id) DO UPDATE SET state_json=excluded.state_json,"
                "revision=excluded.revision,updated_at=excluded.updated_at",
                (story_id, data, next_revision, now)
            )
            db.execute(
                "INSERT INTO world_state_edits VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), story_id, next_revision, data, now)
            )
            db.execute("UPDATE stories SET updated_at=? WHERE id=?", (now, story_id))
        return self.current(story_id)

    def snapshot_turn_in_transaction(self, db, story_id: str, turn_id: str, at: float) -> None:
        row = db.execute(
            "SELECT state_json FROM world_states WHERE story_id=?", (story_id,)
        ).fetchone()
        db.execute(
            "INSERT INTO world_turn_snapshots(turn_id,story_id,state_json,created_at) "
            "VALUES (?,?,?,?)",
            (turn_id, story_id,
             row["state_json"] if row else json.dumps(self.default()), at)
        )

    def snapshot(self, story_id: str, turn_id: str) -> dict:
        self._exists(story_id)
        with self.store._conn() as db:
            row = db.execute(
                "SELECT state_json,created_at FROM world_turn_snapshots "
                "WHERE turn_id=? AND story_id=?",
                (turn_id, story_id)
            ).fetchone()
        if row is None:
            raise ValueError("No hay snapshot para ese turno de esta historia")
        return {"story_id": story_id, "turn_id": turn_id,
                "created_at": row["created_at"], "state": json.loads(row["state_json"])}

    @staticmethod
    def _remap(state: dict, npc_map: dict[str, str]) -> dict:
        result = json.loads(json.dumps(state))
        result["present_character_ids"] = [
            npc_map[id] for id in result["present_character_ids"] if id in npc_map
        ]
        result["relationships"] = {
            npc_map[id]: value for id, value in result["relationships"].items()
            if id in npc_map
        }
        facts = []
        for fact in result["facts"]:
            clone = dict(fact)
            clone["id"] = str(uuid.uuid4())
            clone["witness_character_ids"] = [
                npc_map[id] for id in fact["witness_character_ids"] if id in npc_map
            ]
            if clone["public"] or clone["witness_character_ids"]:
                facts.append(clone)
        result["facts"] = facts
        return result

    def clone(self, source_id: str, target_id: str, turn_map: dict[str, str],
              until_turn_id: str | None, character_map: dict[str, str]) -> None:
        """Copy snapshots and select the *cutoff* state, never the source future."""
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            original = {
                row["turn_id"]: row
                for row in db.execute(
                    "SELECT turn_id,state_json,created_at FROM world_turn_snapshots "
                    "WHERE story_id=?", (source_id,)
                )
            }
            for old_turn_id, new_turn_id in turn_map.items():
                row = original.get(old_turn_id)
                if row is None:
                    continue  # Pre-feature turns never had invented state.
                mapped = self._remap(json.loads(row["state_json"]), character_map)
                db.execute(
                    "INSERT INTO world_turn_snapshots VALUES (?,?,?,?)",
                    (new_turn_id, target_id,
                     json.dumps(mapped, ensure_ascii=False), row["created_at"])
                )
            if until_turn_id:
                cutoff = original.get(until_turn_id)
                selected = (json.loads(cutoff["state_json"]) if cutoff
                            else self.default())
            else:
                current = db.execute(
                    "SELECT state_json FROM world_states WHERE story_id=?",
                    (source_id,)
                ).fetchone()
                selected = json.loads(current["state_json"]) if current else self.default()
            mapped = self._remap(selected, character_map)
            data = json.dumps(mapped, ensure_ascii=False, sort_keys=True)
            now = time.time()
            db.execute(
                "INSERT INTO world_states VALUES (?,?,?,?)",
                (target_id, data, 1, now)
            )
            db.execute(
                "INSERT INTO world_state_edits VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), target_id, 1, data, now)
            )

    def context(self, story_id: str, max_chars: int = 4800) -> str:
        """Only public facts or facts witnessed by *present* NPC enter context."""
        state = self.current(story_id)["state"]
        lines = []
        for label, field in (
            ("Lugar", "location"), ("Momento", "time_of_day"), ("Clima", "weather"),
        ):
            if state[field]:
                lines.append(f"{label}: {state[field]}")
        ids = state["present_character_ids"]
        with self.store._conn() as db:
            names = {row["id"]: json.loads(row["config_json"])["name"]
                     for row in db.execute(
                         "SELECT id,config_json FROM creator_characters WHERE story_id=?",
                         (story_id,)
                     )}
        if ids:
            lines.append("Personajes presentes: " +
                         ", ".join(names.get(identity, "desconocido") for identity in ids))
        if state["inventory"]:
            lines.append("Inventario confirmado: " + "; ".join(state["inventory"]))
        for identity, relation in state["relationships"].items():
            if identity in ids:
                lines.append(f"Relación con {names.get(identity, 'NPC')}: {relation}")
        if state["flags"]:
            lines.append("Indicadores confirmados: " + "; ".join(
                name + "=" + ("sí" if value else "no")
                for name, value in sorted(state["flags"].items())
            ))
        for fact in state["facts"]:
            witnesses = [identity for identity in fact["witness_character_ids"]
                         if identity in ids]
            if not fact["public"] and not witnesses:
                continue
            if fact["public"]:
                line = "Hecho público confirmado: " + fact["text"]
            else:
                line = ("Hecho privado conocido únicamente por " +
                        ", ".join(names.get(identity, "NPC") for identity in
                                  fact["witness_character_ids"]) + ": " + fact["text"])
            lines.append(line)
        if not lines:
            return ""
        header = ("Estado estructurado confirmado por el autor. No cambies estos hechos "
                  "sin confirmación; un NPC no debe hablar de hechos privados "
                  "que no presenció.")
        result = header
        for line in lines:
            if len(result) + len(line) + 1 > max_chars:
                continue
            result += "\n" + line
        return result


def mount_world_state_routes(app, world: WorldStateService) -> None:
    @app.get("/api/v1/stories/{story_id}/world-state")
    def get_world_state(story_id: uuid.UUID):
        try:
            return world.current(str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/world-state")
    def put_world_state(story_id: uuid.UUID, body: WorldStateUpdate):
        try:
            return world.save(str(story_id), body)
        except ValueError as exc:
            code = 409 if "Conflicto de revisión" in str(exc) else 422
            raise HTTPException(code, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/world-state/turns/{turn_id}")
    def get_world_snapshot(story_id: uuid.UUID, turn_id: uuid.UUID):
        try:
            return world.snapshot(str(story_id), str(turn_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
