"""Historical creator blueprint/NPCs must not reveal secrets from future edits."""
from __future__ import annotations

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


class CreatorTimelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-creator-timeline-")
        self.app = create_app(Path(self.temp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        story = self.client.post("/api/v1/stories", json={
            "title": "Guardianes del puerto",
            "premise": "Un viajero explora una ciudad rodeada de murallas.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(story.status_code, 201, story.text)
        self.story = story.json()["id"]
        self.base = "/api/v1/stories/" + self.story
        self.narrative = self.app.state.narrative

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def set_blueprint(self, ai_plot: str):
        response = self.client.put(self.base + "/creator", json={"ai_plot": ai_plot})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def npc(self, name, description, npc_id=None):
        response = self.client.request("PUT" if npc_id else "POST",
            self.base + "/creator/characters" + ("/" + npc_id if npc_id else ""),
            json={"name": name, "description": description})
        self.assertIn(response.status_code, (200, 201), response.text)
        return response.json()

    def turn(self, text):
        return self.narrative.append(
            self.story, str(uuid.uuid4()), "do", text,
            "La aventura continúa lejos de casa.", "fixture",
        )

    def fork(self, turn_id=None):
        response = self.client.post(
            self.base + "/fork", json={"until_turn_id": turn_id})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def cast(self, story_id):
        return self.client.get(
            "/api/v1/stories/" + story_id + "/creator/characters"
        ).json()["characters"]

    def test_past_branch_restores_old_npc_and_private_author_blueprint(self):
        self.set_blueprint("El rey del puerto todavía está vivo.")
        npc = self.npc(
            "Aira", "Aira es una guardiana que desconoce los secretos del castillo.")
        first = self.turn("Visito el puerto")
        self.set_blueprint("El rey murió, pero una impostora sigue ocupando el trono.")
        self.npc(
            "Aira", "Aira descubre que la impostora es la hermana perdida de Luna.",
            npc["id"])
        new_npc = self.npc(
            "Beto", "Beto conoce la identidad secreta del nuevo rey del castillo.")
        second = self.turn("Escucho una revelación")
        old = self.fork(first["id"])
        current = self.fork()
        base_old = "/api/v1/stories/" + old

        old_blueprint = self.client.get(base_old + "/creator").json()
        self.assertIn("todavía está vivo", old_blueprint["ai_plot"])
        self.assertNotIn("impostora", old_blueprint["ai_plot"])
        old_cast = self.cast(old)
        self.assertEqual(len(old_cast), 1)
        self.assertEqual(old_cast[0]["name"], "Aira")
        self.assertNotEqual(old_cast[0]["id"], npc["id"])
        self.assertIn("desconoce", old_cast[0]["description"])
        self.assertNotIn("hermana perdida", old_cast[0]["description"])

        old_system = self.narrative.messages(
            self.narrative.get_story(old), "Hablo con Aira", "do")[0]["content"]
        self.assertIn("todavía está vivo", old_system)
        self.assertNotIn("impostora", old_system)
        self.assertNotIn("hermana perdida", old_system)
        self.assertNotIn("Beto", old_system)

        present = self.client.get(
            "/api/v1/stories/" + current + "/creator").json()
        self.assertIn("impostora", present["ai_plot"])
        new_cast = self.cast(current)
        self.assertEqual(len(new_cast), 2)
        self.assertNotEqual(new_cast[1]["id"], new_npc["id"])
        self.assertIn("hermana perdida", new_cast[0]["description"])

        copied_turns = self.client.get(
            "/api/v1/stories/" + current + "/turns").json()["turns"]
        self.assertEqual(len(copied_turns), 2)
        with self.app.state.store._conn() as db:
            snapshots = [
                db.execute(
                    "SELECT characters_json,blueprint_json "
                    "FROM creator_turn_snapshots WHERE story_id=? AND turn_id=?",
                    (current, t["id"]),
                ).fetchone()
                for t in copied_turns
            ]
        self.assertEqual(len(snapshots), 2)
        import json
        early_cast = json.loads(snapshots[0]["characters_json"])
        late_cast = json.loads(snapshots[1]["characters_json"])
        self.assertEqual(len(early_cast), 1)
        self.assertEqual(len(late_cast), 2)
        self.assertEqual(early_cast[0]["id"], late_cast[0]["id"])
        self.assertEqual(early_cast[0]["id"], new_cast[0]["id"])
        self.assertIn("todavía está vivo", snapshots[0]["blueprint_json"])
        self.assertIn("impostora", snapshots[1]["blueprint_json"])
        self.assertEqual(self.narrative.get_story(self.story)["origin_story_id"], None)
        self.assertEqual(second["story_id"], self.story)

    def test_old_turn_without_snapshot_does_not_import_current_creator_secrets(self):
        prefeature = self.turn("Antes del sistema de memorias")
        with self.app.state.store._conn() as db:
            db.execute(
                "DELETE FROM creator_turn_snapshots WHERE turn_id=?",
                (prefeature["id"],)
            )
        self.set_blueprint("La gran revelación futura ocurre tras cien capítulos.")
        self.npc("Aira", "Aira conoce la revelación sobre el antiguo imperio.")
        fork = self.fork(prefeature["id"])
        self.assertEqual(self.cast(fork), [])
        self.assertEqual(self.client.get(
            "/api/v1/stories/" + fork + "/creator").json()["ai_plot"], "")
        system = self.narrative.messages(
            self.narrative.get_story(fork), "Camino por la ciudad", "do"
        )[0]["content"]
        self.assertNotIn("revelación futura", system)

    def test_creator_snapshot_failure_rolls_back_entire_turn(self):
        self.set_blueprint("No existe ningún secreto confirmado todavía.")
        self.npc("Aira", "Aira observa las estrellas desde la torre principal.")
        key = str(uuid.uuid4())
        with patch.object(self.app.state.creator, "snapshot_turn_in_transaction",
                          side_effect=RuntimeError("creator timeline write failed")):
            with self.assertRaisesRegex(RuntimeError, "creator timeline write failed"):
                self.narrative.append(
                    self.story, key, "do", "Entrar", "La viajera entra.", "fixture")
        self.assertIsNone(self.narrative.previous(self.story, key))
        with self.app.state.store._conn() as db:
            for table in ("story_turns", "creator_turn_snapshots",
                          "lorebook_turn_snapshots", "world_turn_snapshots"):
                self.assertEqual(db.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE story_id=?",
                    (self.story,)
                ).fetchone()[0], 0)
        saved = self.narrative.append(
            self.story, key, "do", "Entrar", "La viajera entra.", "fixture")
        self.assertEqual(self.narrative.previous(self.story, key)["id"], saved["id"])

if __name__ == "__main__":
    unittest.main()
