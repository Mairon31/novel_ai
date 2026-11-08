"""Creator NPC motivations: persistence, update compatibility, fork and prompt scope.

Tests use SQLite/FastAPI fixtures only; no live narrator model is invoked.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class NpcMotivationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "The guarded harbor",
            "premise": "The lighthouse keeper refuses to abandon her records.",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.id = created.json()["id"]
        self.prefix = "/api/v1/stories/" + self.id
        self.url = self.prefix + "/creator/characters"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def create_npc(self, **changes):
        return self.client.post(self.url, json={
            "name": "Mira",
            "description": "The lighthouse keeper safeguards confidential charts.",
            "personality": "Suspicious but patient.",
            "goals": "Keep the harbor safe and recover the missing charts.",
            "boundaries": "Refuses to share charts with strangers without proof.",
            **changes,
        })

    def test_npc_motives_persist_and_influence_only_narrator_system_context(self):
        created = self.create_npc()
        self.assertEqual(created.status_code, 201, created.text)
        saved = created.json()
        self.assertEqual(saved["goals"],
                         "Keep the harbor safe and recover the missing charts.")
        self.assertIn("Refuses", saved["boundaries"])
        narrative = self.app.state.narrative
        message = narrative.messages(narrative.get_story(self.id),
                                     "Give me the charts.", "say")
        system = message[0]["content"]
        self.assertIn("Independent goals and incentives:", system)
        self.assertIn(saved["goals"], system)
        self.assertIn("Refusal conditions and personal limits:", system)
        self.assertIn(saved["boundaries"], system)
        self.assertNotIn(saved["goals"], message[-1]["content"])
        self.assertNotIn(saved["boundaries"], message[-1]["content"])
        with TestClient(create_app(self.root)) as restarted:
            rows = restarted.get(self.url).json()["characters"]
            self.assertEqual(rows[0]["goals"], saved["goals"])
            self.assertEqual(rows[0]["boundaries"], saved["boundaries"])

    def test_old_client_updates_do_not_erase_new_fields(self):
        created = self.create_npc().json()
        target = self.url + "/" + created["id"]
        old_client = self.client.put(target, json={
            "name": "Mira",
            "description": "The lighthouse keeper still holds the guarded maps.",
        })
        self.assertEqual(old_client.status_code, 200, old_client.text)
        self.assertEqual(old_client.json()["goals"], created["goals"])
        self.assertEqual(old_client.json()["boundaries"], created["boundaries"])
        cleared = self.client.put(target, json={
            "name": "Mira",
            "description": "The lighthouse keeper still holds the guarded maps.",
            "goals": "", "boundaries": "",
        })
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertEqual(cleared.json()["goals"], "")
        self.assertEqual(cleared.json()["boundaries"], "")

    def test_length_limits_and_backward_compatible_default(self):
        bad = self.create_npc(goals="x" * 1001)
        self.assertEqual(bad.status_code, 422, bad.text)
        bad = self.create_npc(boundaries="x" * 1001)
        self.assertEqual(bad.status_code, 422, bad.text)
        self.assertEqual(self.client.get(self.url).json()["characters"], [])
        legacy = self.create_npc(goals="", boundaries="")
        self.assertEqual(legacy.status_code, 201, legacy.text)
        self.assertEqual(legacy.json()["goals"], "")
        self.assertEqual(legacy.json()["boundaries"], "")

    def test_fork_keeps_independent_copies_of_npc_goals(self):
        created = self.create_npc()
        self.assertEqual(created.status_code, 201, created.text)
        fork = self.client.post(self.prefix + "/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        child = fork.json()["id"]
        fork_url = f"/api/v1/stories/{child}/creator/characters"
        clone = self.client.get(fork_url).json()["characters"][0]
        self.assertNotEqual(clone["id"], created.json()["id"])
        self.assertEqual(clone["goals"], created.json()["goals"])
        self.assertEqual(clone["boundaries"], created.json()["boundaries"])
        changed = self.client.put(fork_url + "/" + clone["id"], json={
            "name": "Mira",
            "description": "The guardian has joined the neighboring village.",
            "goals": "Help the new town restore its old port.",
        })
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.client.get(self.url).json()["characters"][0]["goals"],
                         created.json()["goals"])


if __name__ == "__main__":
    unittest.main()
