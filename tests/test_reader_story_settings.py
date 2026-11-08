"""Story-level narrative freedom patch must not overwrite creator text."""
from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class ReaderStorySettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "The harbor covenant",
            "premise": "The lighthouse guardian has hidden an important artifact.",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.prefix = "/api/v1/stories/" + self.story

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_atomic_patch_preserves_blueprint_arcs_and_secret_guidance(self):
        beat_id = str(uuid.uuid4())
        initial = self.client.put(self.prefix + "/creator", json={
            "ai_plot": "The true map belongs to Mira.",
            "guidelines": "Guardian may refuse to show her map.",
            "player_plot": "The map might be found in the harbor.",
            "arc_beats": [{
                "id": beat_id, "title": "Find the map",
                "aim": "Learn who moved the lighthouse map overnight.",
                "status": "active",
            }],
        })
        self.assertEqual(initial.status_code, 200, initial.text)
        saved = initial.json()
        for mode in ("strict", "guided", "flexible"):
            with self.subTest(mode=mode):
                patched = self.client.patch(self.prefix + "/creator/freedom", json={
                    "freedom_mode": mode,
                })
                self.assertEqual(patched.status_code, 200, patched.text)
                result = patched.json()
                self.assertEqual(result["freedom_mode"], mode)
                for key in ("ai_plot", "guidelines", "player_plot", "arc_beats"):
                    self.assertEqual(result[key], saved[key])
                story = self.app.state.narrative.get_story(self.story)
                self.assertIn("Story freedom: " + mode.upper(),
                              self.app.state.narrative.messages(
                                  story, "Look at the lighthouse.", "observe"
                              )[0]["content"])
        bad = self.client.patch(self.prefix + "/creator/freedom", json={
            "freedom_mode": "unlimited",
        })
        self.assertEqual(bad.status_code, 422, bad.text)
        self.assertEqual(self.client.get(self.prefix + "/creator").json()["freedom_mode"],
                         "flexible")

    def test_new_stories_and_missing_ids_are_story_scoped(self):
        second = self.client.post("/api/v1/stories", json={
            "title": "The other coast",
            "premise": "A different guardian protects a distant coast.",
        }).json()["id"]
        self.assertEqual(self.client.patch(self.prefix + "/creator/freedom",
                                           json={"freedom_mode": "strict"}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/stories/" + second +
                                         "/creator").json()["freedom_mode"], "flexible")
        absent = self.client.patch("/api/v1/stories/" + str(uuid.uuid4()) +
                                   "/creator/freedom", json={"freedom_mode": "guided"})
        self.assertEqual(absent.status_code, 404, absent.text)
        wrong_type = self.client.patch(self.prefix + "/creator/freedom",
                                       json={"freedom_mode": 17})
        self.assertEqual(wrong_type.status_code, 422)


if __name__ == "__main__":
    unittest.main()
