"""Indexed historical player actions: recall, story isolation, fallback and rollback."""
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


class EpisodicMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-episodic-")
        self.app = create_app(Path(self.temp.name))
        self.session = TestClient(self.app)
        self.client = self.session.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "Memorias del sello",
            "premise": "Una exploradora atraviesa el desierto para recuperar un sello antiguo.",
            "protagonist_name": "Aira",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.narrative = self.app.state.narrative

    def tearDown(self):
        self.session.__exit__(None, None, None)
        self.temp.cleanup()

    def turn(self, text, story=None, reply="La exploradora continúa."):
        return self.narrative.append(story or self.story, str(uuid.uuid4()),
                                     "do", text, reply, "fixture")

    def search(self, query, story=None, limit=6, client=None):
        result = (client or self.client).get(
            f"/api/v1/stories/{story or self.story}/memory/search",
            params={"q": query, "limit": limit})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def test_ftsearch_retrieves_old_player_action_but_not_assistant_secret(self):
        self.assertTrue(self.app.state.episodes.fts_enabled)
        first = self.turn("Recogí el medallón de cuarzo en la cripta",
                          "La guardiana menciona un secreto prohibido y oculto.")
        for i in range(115):
            self.turn("Camino por el sendero " + str(i))
        result = self.search("medallón cuarzo")
        self.assertEqual(len(result["episodes"]), 1)
        self.assertEqual(result["episodes"][0]["turn_id"], first["id"])
        self.assertEqual(result["source"], "player_input")
        self.assertNotIn("secreto prohibido", str(result))
        self.assertEqual(self.search("secreto prohibido")["episodes"], [])

        story = self.narrative.get_story(self.story)
        messages = self.narrative.messages(story, "Inspecciono el medallón de cuarzo", "do")
        self.assertIn("Recuerdo de una intervención pasada del jugador", messages[1]["content"])
        self.assertIn("medallón de cuarzo", messages[1]["content"])
        self.assertNotIn("secreto prohibido", messages[0]["content"])
        self.assertEqual(messages[1]["role"], "user")
        self.assertEqual(messages[-1]["role"], "user")

    def test_branch_indexes_only_own_history_and_never_future_turns(self):
        old = self.turn("Visito el faro de obsidiana")
        self.turn("Encuentro la llave de esmeralda")
        branch = self.client.post(f"/api/v1/stories/{self.story}/fork",
                                  json={"until_turn_id": old["id"]})
        self.assertEqual(branch.status_code, 201, branch.text)
        copied = branch.json()["id"]
        self.assertEqual(len(self.search("faro obsidiana", story=copied)["episodes"]), 1)
        self.assertEqual(self.search("llave esmeralda", story=copied)["episodes"], [])
        self.assertEqual(len(self.search("llave esmeralda")["episodes"]), 1)

        self.turn("Visito la torre de amatista", story=copied)
        self.assertEqual(self.search("torre amatista")["episodes"], [])
        self.assertEqual(len(self.search("torre amatista", story=copied)["episodes"]), 1)
        full = self.client.post(f"/api/v1/stories/{self.story}/fork",
                                json={"until_turn_id": None})
        self.assertEqual(full.status_code, 201, full.text)
        self.assertEqual(len(self.search("llave esmeralda",
                                         story=full.json()["id"])["episodes"]), 1)
        self.assertNotEqual(old["id"],
                            self.search("faro obsidiana", story=copied)["episodes"][0]["turn_id"])

    def test_index_failure_rollback_turn_and_snapshots_together(self):
        with self.app.state.store._conn() as db:
            initial = db.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?", (self.story,)
            ).fetchone()[0]
        with patch.object(self.app.state.episodes, "index_turn_in_transaction",
                          side_effect=RuntimeError("simulated FTS write error")):
            with self.assertRaisesRegex(RuntimeError, "simulated FTS write error"):
                self.turn("Exploro el refugio")
        self.assertEqual(self.search("refugio")["episodes"], [])
        with self.app.state.store._conn() as db:
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?",
                (self.story,)).fetchone()[0], initial)

    def test_lexical_fallback_and_restart_backfill_support_legacy_history(self):
        prior = self.turn("Encontré el pergamino de azafrán")
        memory = self.app.state.episodes
        memory.fts_enabled = False
        self.assertEqual(len(self.search("pergamino azafrán")["episodes"]), 1)
        memory.fts_enabled = True
        with self.app.state.store._conn() as db:
            db.execute("DROP TABLE narrative_turn_fts")
        rebooted = create_app(Path(self.temp.name))
        with TestClient(rebooted) as client:
            data = self.search("pergamino azafrán", client=client)
            self.assertTrue(data["fts5"])
            self.assertEqual(data["episodes"][0]["turn_id"], prior["id"])

    def test_query_is_bounded_and_cross_story_lookup_is_rejected(self):
        self.turn("El mapa lunar está en la caverna")
        self.assertEqual(self.search('lunar" OR *')['episodes'][0]['input_text'],
                         "El mapa lunar está en la caverna")
        blank = self.search("de la que")
        self.assertEqual(blank["episodes"], [])
        unknown = self.client.get(
            f"/api/v1/stories/{uuid.uuid4()}/memory/search", params={"q": "mapa"})
        self.assertEqual(unknown.status_code, 404)
        oversize = self.client.get(
            f"/api/v1/stories/{self.story}/memory/search", params={"q": "a" * 501})
        self.assertEqual(oversize.status_code, 422)


if __name__ == "__main__":
    unittest.main()
