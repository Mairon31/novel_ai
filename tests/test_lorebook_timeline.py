"""Immutable historical Lorebook facts, deletion, and cutoff-safe branch recovery."""
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


class LorebookTimelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-lore-timeline-")
        self.app = create_app(Path(self.temp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        result = self.client.post("/api/v1/stories", json={
            "title": "Ruta de secretos",
            "premise": "Una viajera desconoce los secretos de un castillo.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(result.status_code, 201, result.text)
        self.story = result.json()["id"]
        self.base = f"/api/v1/stories/{self.story}/lorebook"
        self.narrative = self.app.state.narrative

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    @staticmethod
    def draft(title="Ruinas", content="En las ruinas está escondida una pequeña llave.", keys=None):
        return {"title": title, "content": content, "keys": keys or ["ruinas"],
                "priority": 75}

    def add(self, **fields):
        resp = self.client.post(self.base, json={**self.draft(), **fields})
        self.assertEqual(resp.status_code, 201, resp.text)
        return resp.json()

    def step(self, text="Exploro la escena"):
        return self.narrative.append(
            self.story, str(uuid.uuid4()), "do", text,
            "Los personajes caminan bajo el cielo.", "fixture",
        )

    def history(self, turn_id, story=None):
        story_id = story or self.story
        return self.client.get(
            f"/api/v1/stories/{story_id}/lorebook/turns/{turn_id}")

    def branch(self, cutoff=None):
        result = self.client.post(f"/api/v1/stories/{self.story}/fork",
                                  json={"until_turn_id": cutoff})
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()["id"]

    def entries(self, story_id):
        res = self.client.get(f"/api/v1/stories/{story_id}/lorebook")
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["entries"]

    def test_branch_at_old_turn_excludes_future_entries_and_secret_edits(self):
        first = self.add()
        early = self.step("Visito la ciudad")
        newer = self.client.put(self.base + "/" + first["id"], json={
            **self.draft(content="El castillo es controlado secretamente por la hermana de Luna."),
        })
        self.assertEqual(newer.status_code, 200, newer.text)
        future = self.add(title="Revelación", keys=["castillo"],
                          content="El rey ya murió y una impostora ocupa su trono.")
        late = self.step("Descubro el castillo")
        self.assertEqual(len(self.entries(self.story)), 2)

        before = self.history(early["id"])
        self.assertEqual(before.status_code, 200, before.text)
        self.assertEqual([x["id"] for x in before.json()["entries"]], [first["id"]])
        self.assertIn("pequeña llave", before.json()["entries"][0]["content"])
        later = self.history(late["id"])
        self.assertEqual(later.status_code, 200)
        self.assertEqual(len(later.json()["entries"]), 2)
        self.assertIn("hermana", later.json()["entries"][0]["content"])

        old_branch = self.branch(early["id"])
        old_entries = self.entries(old_branch)
        self.assertEqual(len(old_entries), 1)
        self.assertNotEqual(old_entries[0]["id"], first["id"])
        self.assertIn("pequeña llave", old_entries[0]["content"])
        old_story = self.narrative.get_story(old_branch)
        prompt = self.narrative.messages(old_story, "Entro en las ruinas del castillo", "do")
        self.assertIn("pequeña llave", prompt[0]["content"])
        self.assertNotIn("hermana de Luna", prompt[0]["content"])
        self.assertNotIn("impostora", prompt[0]["content"])

        full = self.branch()
        full_entries = self.entries(full)
        self.assertEqual(len(full_entries), 2)
        self.assertIn("hermana", full_entries[0]["content"])
        self.assertNotEqual(full_entries[0]["id"], first["id"])
        self.assertNotEqual(full_entries[1]["id"], future["id"])

        old_turns = self.client.get(
            f"/api/v1/stories/{full}/turns").json()["turns"]
        snapshots = [self.history(turn["id"], full).json()["entries"]
                     for turn in old_turns]
        self.assertEqual(len(snapshots[0]), 1)
        self.assertEqual(len(snapshots[1]), 2)
        # The same fact must retain its mapped UUID across the cloned timeline.
        self.assertEqual(snapshots[0][0]["id"], snapshots[1][0]["id"])
        self.assertEqual(full_entries[0]["id"], snapshots[0][0]["id"])
        self.assertIn("pequeña llave", snapshots[0][0]["content"])
        self.assertIn("hermana", snapshots[1][0]["content"])

    def test_entry_deleted_after_turn_exists_in_old_branch_but_not_new(self):
        first = self.add(title="Antigua ley", keys=["ley"],
                         content="Por ley los viajeros no pueden entrar al salón real.")
        before_delete = self.step("Escucho la ley")
        deleted = self.client.delete(self.base + "/" + first["id"])
        self.assertEqual(deleted.status_code, 204)
        after_delete = self.step("Llego al salón")
        self.assertEqual(self.entries(self.story), [])
        snapshot = self.history(before_delete["id"]).json()["entries"]
        self.assertEqual(len(snapshot), 1)
        self.assertIn("viajeros", snapshot[0]["content"])
        self.assertEqual(self.history(after_delete["id"]).json()["entries"], [])
        early = self.branch(before_delete["id"])
        recent = self.branch()
        self.assertEqual(len(self.entries(early)), 1)
        self.assertEqual(self.entries(recent), [])
        self.assertEqual(self.history(
            self.client.get(f"/api/v1/stories/{early}/turns")
            .json()["turns"][0]["id"], early).status_code, 200)

    def test_turn_and_lore_snapshot_rollback_together(self):
        self.add()
        key = str(uuid.uuid4())
        with patch.object(self.app.state.lorebook,
                          "snapshot_turn_in_transaction",
                          side_effect=RuntimeError("injected lore snapshot failure")):
            with self.assertRaisesRegex(RuntimeError, "injected lore snapshot failure"):
                self.narrative.append(
                    self.story, key, "do", "Entro", "El héroe entra.", "fixture")
        with self.app.state.store._conn() as db:
            count = db.execute("SELECT COUNT(*) FROM story_turns WHERE story_id=?",
                               (self.story,)).fetchone()[0]
            snapshots = db.execute(
                "SELECT COUNT(*) FROM lorebook_turn_snapshots WHERE story_id=?",
                (self.story,)).fetchone()[0]
            world_snaps = db.execute(
                "SELECT COUNT(*) FROM world_turn_snapshots WHERE story_id=?",
                (self.story,)).fetchone()[0]
        self.assertEqual((count, snapshots, world_snaps), (0, 0, 0))
        saved = self.narrative.append(
            self.story, key, "do", "Entro", "El héroe entra.", "fixture")
        self.assertEqual(len(self.history(saved["id"]).json()["entries"]), 1)
        again = self.narrative.append(
            self.story, key, "do", "repetido", "repetido", "fixture")
        self.assertEqual(again["id"], saved["id"])
        with self.app.state.store._conn() as db:
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM lorebook_turn_snapshots WHERE story_id=?",
                (self.story,)).fetchone()[0], 1)

    def test_partial_fork_of_pre_migration_turn_fails_closed_without_future_lore(self):
        first = self.step("Viajo antes de que exista la función")
        with self.app.state.store._conn() as db:
            db.execute("DELETE FROM lorebook_turn_snapshots WHERE turn_id=?", (first["id"],))
        future = self.add(title="Secreto moderno", keys=["reino"],
                          content="La identidad del enemigo se revela al final del libro.")
        forked = self.branch(first["id"])
        self.assertEqual(self.entries(forked), [])
        fork_turn = self.client.get(f"/api/v1/stories/{forked}/turns").json()["turns"][0]
        self.assertEqual(self.history(fork_turn["id"], forked).status_code, 404)
        self.assertEqual(len(self.entries(self.story)), 1)
        self.assertEqual(self.entries(self.story)[0]["id"], future["id"])

    def test_historical_snapshot_is_story_scoped_and_survives_restart(self):
        entry = self.add()
        turn = self.step()
        other = self.client.post("/api/v1/stories", json={
            "title": "Mundo independiente",
            "premise": "Otra persona explora un reino distante.",
        }).json()["id"]
        wrong = self.history(turn["id"], other)
        self.assertEqual(wrong.status_code, 404)
        self.assertIn(entry["id"], [e["id"] for e in self.history(turn["id"]).json()["entries"]])
        app_again = create_app(Path(self.temp.name))
        with TestClient(app_again) as client:
            response = client.get(
                f"/api/v1/stories/{self.story}/lorebook/turns/{turn['id']}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()["entries"]), 1)

if __name__ == "__main__":
    unittest.main()
