"""Author-confirmed world facts: API, immutable per-turn state, witness isolation.

Uses real SQLite and the installed FastAPI app, no external model or GPU.
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


class WorldStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-world-state-")
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        story = self.client.post("/api/v1/stories", json={
            "title": "Puerto de los secretos",
            "premise": "Dos guardianes custodian la puerta de un reino antiguo.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(story.status_code, 201, story.text)
        self.story_id = story.json()["id"]
        self.base = f"/api/v1/stories/{self.story_id}/world-state"
        self.narrative = self.app.state.narrative
        self.aira = self.add_npc("Aira")
        self.beto = self.add_npc("Beto")

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def add_npc(self, name):
        response = self.client.post(
            f"/api/v1/stories/{self.story_id}/creator/characters",
            json={"name": name,
                  "description": f"{name} protege el puerto y conserva recuerdos de la ciudad."},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def default(self):
        response = self.client.get(self.base)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def state(self, **overrides):
        return {
            "location": "Puerto de niebla",
            "time_of_day": "noche",
            "weather": "lluvia",
            "present_character_ids": [self.aira],
            "inventory": ["llave oxidada"],
            "relationships": {self.aira: "amiga de Luna"},
            "flags": {"porton_abierto": False},
            "facts": [
                {"id": str(uuid.uuid4()), "text": "El rey guardó el sello bajo el faro.",
                 "public": False, "witness_character_ids": [self.aira]},
                {"id": str(uuid.uuid4()), "text": "El puerto se cerró durante la tormenta.",
                 "public": True, "witness_character_ids": []},
            ],
            **overrides,
        }

    def save(self, state, revision=0, base=None):
        return self.client.put(base or self.base, json={
            "expected_revision": revision, "state": state,
        })

    def turn(self, instruction="Avanzo"):
        return self.narrative.append(
            self.story_id, str(uuid.uuid4()), "do", instruction,
            "Luna avanza por el puerto.", "fixture-llm",
        )

    def test_revision_validation_and_reference_ownership(self):
        self.assertEqual(self.default()["revision"], 0)
        data = self.state()
        response = self.save(data)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["revision"], 1)
        self.assertEqual(response.json()["state"]["present_character_ids"], [self.aira])
        conflict = self.save(self.state(location="castillo"), revision=0)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(self.default()["state"]["location"], "Puerto de niebla")
        invalid = self.save(self.state(
            present_character_ids=[str(uuid.uuid4())]), revision=1)
        self.assertEqual(invalid.status_code, 422)
        invalid_private = self.save(self.state(facts=[
            {"text": "Un secreto debe tener un testigo válido.",
             "public": False, "witness_character_ids": []},
        ]), revision=1)
        self.assertEqual(invalid_private.status_code, 422)
        duplicate = self.save(self.state(inventory=["mapa", "MAPA"]), revision=1)
        self.assertEqual(duplicate.status_code, 422)
        self.assertEqual(self.default()["revision"], 1)

    def test_private_fact_is_not_injected_until_witness_is_present(self):
        value = self.state(present_character_ids=[self.beto], relationships={})
        self.assertEqual(self.save(value).status_code, 200)
        story = self.narrative.get_story(self.story_id)
        content = self.narrative.messages(story, "Entro al faro", "do")[0]["content"]
        self.assertIn("Hecho público confirmado", content)
        self.assertNotIn("El rey guardó el sello", content)
        self.assertIn("Beto", content)
        updated = self.state(present_character_ids=[self.aira, self.beto])
        self.assertEqual(self.save(updated, revision=1).status_code, 200)
        content = self.narrative.messages(story, "Entro al faro", "do")[0]["content"]
        self.assertIn("El rey guardó el sello", content)
        self.assertIn("conocido únicamente por Aira", content)
        self.assertNotIn("El rey guardó el sello",
                         self.narrative.messages(story, "Entro al faro", "do")[-1]["content"])

    def test_turn_snapshot_is_immutable_after_future_author_edits(self):
        self.assertEqual(self.save(self.state(location="puerto")).status_code, 200)
        first = self.turn()
        snap = self.client.get(self.base + "/turns/" + first["id"])
        self.assertEqual(snap.status_code, 200, snap.text)
        self.assertEqual(snap.json()["state"]["location"], "puerto")
        revised = self.state(location="castillo", present_character_ids=[self.beto],
                             relationships={})
        self.assertEqual(self.save(revised, revision=1).status_code, 200)
        second = self.turn()
        latest = self.client.get(self.base + "/turns/" + second["id"])
        self.assertEqual(latest.json()["state"]["location"], "castillo")
        self.assertEqual(self.client.get(self.base + "/turns/" + first["id"]).json()
                         ["state"]["location"], "puerto")
        self.assertEqual(self.default()["state"]["location"], "castillo")
        self.assertEqual(
            self.client.get(self.base + "/turns/" + str(uuid.uuid4())).status_code,
            404,
        )

    def test_fork_cutoff_replays_old_world_including_mapped_witnesses(self):
        state = self.state(location="taverna antigua")
        original_fact_id = state["facts"][0]["id"]
        self.assertEqual(self.save(state).status_code, 200)
        first = self.turn("Observo la taberna")
        self.assertEqual(self.save(self.state(
            location="castillo futuro", present_character_ids=[self.beto],
            relationships={}), revision=1).status_code, 200)
        later = self.turn("Veo el castillo")
        response = self.client.post(
            f"/api/v1/stories/{self.story_id}/fork",
            json={"until_turn_id": first["id"]},
        )
        self.assertEqual(response.status_code, 201, response.text)
        branch_id = response.json()["id"]
        branch_state = self.client.get(
            f"/api/v1/stories/{branch_id}/world-state").json()
        branch = branch_state["state"]
        self.assertEqual(branch["location"], "taverna antigua")
        self.assertNotIn(self.aira, branch["present_character_ids"])
        self.assertEqual(len(branch["present_character_ids"]), 1)
        mapped_npc = branch["present_character_ids"][0]
        self.assertEqual(branch["facts"][0]["witness_character_ids"], [mapped_npc])
        self.assertNotEqual(branch["facts"][0]["id"], original_fact_id)
        self.assertEqual(branch["relationships"], {mapped_npc: "amiga de Luna"})
        branch_turns = self.client.get(
            f"/api/v1/stories/{branch_id}/turns").json()["turns"]
        self.assertEqual(len(branch_turns), 1)
        archived = self.client.get(
            f"/api/v1/stories/{branch_id}/world-state/turns/{branch_turns[0]['id']}")
        self.assertEqual(archived.json()["state"]["location"], "taverna antigua")
        changed = self.save(self.state(
            location="bosque de la rama", present_character_ids=[self.aira],
            relationships={}), revision=branch_state["revision"],
            base=f"/api/v1/stories/{branch_id}/world-state")
        # Parent character UUIDs are not accepted in a fork.
        self.assertEqual(changed.status_code, 422)
        branch["location"] = "bosque de la rama"
        updated = self.save(branch, branch_state["revision"],
                            base=f"/api/v1/stories/{branch_id}/world-state")
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(self.default()["state"]["location"], "castillo futuro")
        self.assertEqual(self.client.get(
            self.base + "/turns/" + later["id"]).json()["state"]["location"],
            "castillo futuro")

    def test_branch_restores_historical_canon_instead_of_future_spoiler(self):
        old = "La protagonista todavía desconoce quién gobierna el castillo."
        future = "La protagonista descubre que su hermana gobierna el castillo."
        first_canon = self.client.patch(
            f"/api/v1/stories/{self.story_id}/canon", json={"canon": old})
        self.assertEqual(first_canon.status_code, 200)
        self.assertEqual(self.save(self.state(location="puerto")).status_code, 200)
        first = self.turn("Llego a la entrada")
        first_snapshot = self.client.get(self.base + "/turns/" + first["id"])
        self.assertEqual(first_snapshot.json()["canon"], old)
        self.client.patch(f"/api/v1/stories/{self.story_id}/canon",
                          json={"canon": future})
        self.assertEqual(self.save(self.state(location="castillo"), revision=1).status_code, 200)
        later = self.turn("Abro la puerta del castillo")
        self.assertEqual(self.client.get(
            self.base + "/turns/" + later["id"]).json()["canon"], future)
        branch_response = self.client.post(
            f"/api/v1/stories/{self.story_id}/fork",
            json={"until_turn_id": first["id"]})
        self.assertEqual(branch_response.status_code, 201, branch_response.text)
        branched = branch_response.json()
        self.assertEqual(branched["canon"], old)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{branched['id']}/world-state").json()["state"]
                         ["location"], "puerto")
        self.assertEqual(self.narrative.get_story(self.story_id)["canon"], future)
        current_branch = self.client.post(
            f"/api/v1/stories/{self.story_id}/fork", json={})
        self.assertEqual(current_branch.status_code, 201)
        self.assertEqual(current_branch.json()["canon"], future)

    def test_cloned_fact_ids_remain_stable_across_branch_timeline(self):
        initial = self.state()
        fact_id = initial["facts"][0]["id"]
        self.assertEqual(self.save(initial).status_code, 200)
        one = self.turn("Primera escena")
        two = self.turn("Segunda escena")
        fork_response = self.client.post(
            f"/api/v1/stories/{self.story_id}/fork", json={})
        self.assertEqual(fork_response.status_code, 201, fork_response.text)
        branch_id = fork_response.json()["id"]
        target_base = f"/api/v1/stories/{branch_id}/world-state"
        turns = self.client.get(f"/api/v1/stories/{branch_id}/turns").json()["turns"]
        self.assertEqual(len(turns), 2)
        snapshots = [self.client.get(
            target_base + "/turns/" + turn["id"]).json()["state"]
            for turn in turns]
        branch_current = self.client.get(target_base).json()["state"]
        branch_fact_id = branch_current["facts"][0]["id"]
        self.assertNotEqual(branch_fact_id, fact_id)
        self.assertEqual(
            [snapshot["facts"][0]["id"] for snapshot in snapshots],
            [branch_fact_id, branch_fact_id],
        )
        self.assertNotEqual(one["id"], turns[0]["id"])
        self.assertNotEqual(two["id"], turns[1]["id"])

    def test_existing_snapshot_table_migrates_to_versioned_canon(self):
        with self.app.state.store._conn() as db:
            db.execute("DROP TABLE world_turn_snapshots")
            db.execute(
                "CREATE TABLE world_turn_snapshots("
                "turn_id TEXT PRIMARY KEY, story_id TEXT NOT NULL,"
                "state_json TEXT NOT NULL, created_at REAL NOT NULL)"
            )
        from noble_api.world_state import WorldStateService
        WorldStateService(self.narrative)
        with self.app.state.store._conn() as db:
            columns = {row[1] for row in db.execute(
                "PRAGMA table_info(world_turn_snapshots)")}
        self.assertIn("canon_text", columns)
        turn = self.turn("Primer turno después de la migración")
        result = self.client.get(self.base + "/turns/" + turn["id"])
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["canon"], "")

    def test_failed_snapshot_rolls_back_turn_and_visual_transition(self):
        self.assertEqual(self.save(self.state()).status_code, 200)
        key = str(uuid.uuid4())
        visual = self.app.state.visual
        with patch.object(self.app.state.world, "snapshot_turn_in_transaction",
                          side_effect=sqlite3.IntegrityError("forced snapshot failure")):
            with self.assertRaisesRegex(sqlite3.IntegrityError, "forced snapshot failure"):
                self.narrative.append(
                    self.story_id, key, "do", "Entrar al bosque",
                    "Llegaron al bosque oscuro.", "fixture",
                )
        self.assertIsNone(self.narrative.previous(self.story_id, key))
        with self.app.state.store._conn() as db:
            turns = db.execute("SELECT COUNT(*) FROM story_turns WHERE story_id=?",
                               (self.story_id,)).fetchone()[0]
            scenes = db.execute("SELECT COUNT(*) FROM visual_scenes WHERE story_id=?",
                                (self.story_id,)).fetchone()[0]
            snapshots = db.execute(
                "SELECT COUNT(*) FROM world_turn_snapshots WHERE story_id=?",
                (self.story_id,)).fetchone()[0]
        self.assertEqual((turns, scenes, snapshots), (0, 0, 0))
        committed = self.narrative.append(
            self.story_id, key, "do", "Entrar al bosque",
            "Llegaron al bosque oscuro.", "fixture",
        )
        self.assertEqual(self.client.get(
            self.base + "/turns/" + committed["id"]).status_code, 200)
        self.assertEqual(self.narrative.previous(self.story_id, key)["id"], committed["id"])

    def test_world_state_and_snapshots_survive_restart(self):
        self.assertEqual(self.save(self.state(location="biblioteca")).status_code, 200)
        turn = self.turn()
        restarted = create_app(Path(self.tmp.name))
        with TestClient(restarted) as client:
            saved = client.get(self.base)
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["revision"], 1)
            snap = client.get(self.base + "/turns/" + turn["id"])
            self.assertEqual(snap.status_code, 200)
            self.assertEqual(snap.json()["state"]["location"], "biblioteca")


if __name__ == "__main__":
    unittest.main()
