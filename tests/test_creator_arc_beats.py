"""Author-reviewed arc milestones in the narrator context, never auto-resolved.

All tests are offline API / SQLite contracts; no LLM, GPU, or network is used.
"""
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


class NarrativeArcBeatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "The lost harbor",
            "premise": "A traveler seeks a forgotten map near the lighthouse.",
            "protagonist_name": "Lia",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.base = "/api/v1/stories/" + self.story
        self.endpoint = self.base + "/creator"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def beats(self):
        return [
            {"id": str(uuid.uuid4()), "title": "Find the original map",
             "aim": "Discover why the lighthouse guardian locked the archives.",
             "status": "planned"},
            {"id": str(uuid.uuid4()), "title": "Negotiate with the guardian",
             "aim": "Persuade the guardian to reveal the harbor records.",
             "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Resolve the old blockade",
             "aim": "Confirm that the fishermen regained access to the sea.",
             "status": "resolved"},
        ]

    def test_open_beats_in_system_context_resolved_beats_excluded(self):
        beats = self.beats()
        saved = self.client.put(self.endpoint, json={
            "ai_plot": "The maps belong to the guardian, not the player.",
            "arc_beats": beats,
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["arc_beats"], beats)
        narrative = self.app.state.narrative
        messages = narrative.messages(narrative.get_story(self.story),
                                      "Can I see the archives?", "say")
        system = messages[0]["content"]
        self.assertIn("Narrative director arc beats", system)
        self.assertIn("Find the original map", system)
        self.assertIn("Negotiate with the guardian", system)
        self.assertNotIn("Resolve the old blockade", system)
        self.assertIn("Do not control the protagonist", system)
        self.assertEqual(messages[-1]["role"], "user")
        self.assertNotIn("Find the original map", messages[-1]["content"])
        self.assertIn("The maps belong to the guardian", system)
        preview = self.client.post(self.base + "/context/preview", json={
            "input_text": "Can I see the archives?", "mode": "say",
        })
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["messages"], messages)
        self.assertTrue(any(section["name"] == "Creator and characters"
                            for section in preview.json()["sections"]))

    def test_legacy_updates_preserve_reviewed_milestones(self):
        beats = self.beats()
        self.assertEqual(self.client.put(self.endpoint, json={
            "arc_beats": beats,
        }).status_code, 200)
        updated = self.client.put(self.endpoint, json={
            "guidelines": "Let NPCs refuse unreasonable demands.",
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["arc_beats"], beats)
        with TestClient(create_app(Path(self.tmp.name))) as restarted:
            restored = restarted.get(self.endpoint)
            self.assertEqual(restored.json()["arc_beats"], beats)

    def test_validation_rejects_duplicate_ids_and_invalid_status(self):
        beats = self.beats()
        duplicate = self.client.put(self.endpoint, json={
            "arc_beats": [beats[0], {**beats[1], "id": beats[0]["id"]}],
        })
        self.assertEqual(duplicate.status_code, 422, duplicate.text)
        invalid = self.client.put(self.endpoint, json={
            "arc_beats": [{**beats[0], "status": "automatically_completed"}],
        })
        self.assertEqual(invalid.status_code, 422, invalid.text)
        oversized = self.client.put(self.endpoint, json={
            "arc_beats": [dict(beats[0], id=str(uuid.uuid4())) for _ in range(9)],
        })
        self.assertEqual(oversized.status_code, 422, oversized.text)
        short = self.client.put(self.endpoint, json={
            "arc_beats": [{**beats[0], "aim": "Too short"}],
        })
        # 'Too short' is nine characters and therefore valid; a shorter
        # entry must be rejected, not silently padded.
        self.assertEqual(short.status_code, 200, short.text)
        truly_short = self.client.put(self.endpoint, json={
            "arc_beats": [{**beats[0], "aim": "no"}],
        })
        self.assertEqual(truly_short.status_code, 422, truly_short.text)

    def test_fork_preserves_arc_plan_and_isolated_progress(self):
        beats = self.beats()
        self.client.put(self.endpoint, json={"arc_beats": beats})
        fork = self.client.post(self.base + "/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        other = "/api/v1/stories/" + fork.json()["id"] + "/creator"
        copied = self.client.get(other)
        self.assertEqual(copied.status_code, 200, copied.text)
        self.assertEqual(copied.json()["arc_beats"], beats)
        changed = self.client.put(other, json={
            "arc_beats": [{**beats[0], "status": "resolved"}, *beats[1:]],
        })
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.client.get(self.endpoint).json()["arc_beats"][0]["status"],
                         "planned")
        self.assertEqual(self.client.get(other).json()["arc_beats"][0]["status"],
                         "resolved")


if __name__ == "__main__":
    unittest.main()
