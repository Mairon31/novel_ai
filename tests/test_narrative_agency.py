"""Offline checks for narrator agency rules and mode-specific causality.

These assert prompt construction, not semantic compliance by an actual LLM.
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
from noble_api.narrative_agency import agency_directives  # noqa: E402


class AgencyContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cm = TestClient(create_app(Path(self.tmp.name)))
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "Harbor decisions",
            "premise": "A lighthouse guardian refuses to reveal a forbidden map.",
            "protagonist_name": "Lia",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.id = created.json()["id"]
        self.prefix = "/api/v1/stories/" + self.id

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_distinct_mode_rules_disallow_automatic_success_or_player_control(self):
        hints = {mode: agency_directives(mode, []) for mode in
                 ("say", "do", "story", "continue")}
        for mode, text in hints.items():
            with self.subTest(mode=mode):
                self.assertIn("Player agency:", text)
                self.assertIn("NPC agency:", text)
                self.assertIn("Causal continuity:", text)
                self.assertIn("Current interaction:", text)
                self.assertIn("refuse", text)
        self.assertIn("not automatic success", hints["do"])
        self.assertIn("not a guarantee", hints["say"])
        self.assertIn("NPC initiative", hints["continue"])
        self.assertIn("confirmed canon", hints["story"])
        with self.assertRaises(ValueError):
            agency_directives("unsupported", [])

    def test_consecutive_continue_guidance_is_event_sensitive(self):
        regular = agency_directives("continue", [
            {"mode": "do"}, {"mode": "continue"}])
        repeated = agency_directives("continue", [
            {"mode": "continue"}, {"mode": "continue"}])
        self.assertNotIn("Advance an unresolved event", regular)
        self.assertIn("Advance an unresolved event", repeated)
        self.assertNotIn("Advance an unresolved event", agency_directives("say", []))

    def test_story_context_keeps_creator_directives_without_player_takeover(self):
        creator = self.client.put(self.prefix + "/creator", json={
            "guidelines": "Keep the guardian suspicious and allow refusal.",
            "ai_plot": "The old map belongs to Mira, but Lia does not know this.",
        })
        self.assertEqual(creator.status_code, 200, creator.text)
        story = self.app().state.narrative.get_story(self.id)
        # A simulated/no-GPU request still uses the production messages builder.
        for mode in ("say", "do", "story", "continue"):
            with self.subTest(mode=mode):
                packet = self.app().state.narrative.messages(
                    story, "Give me the map", mode)
                system = packet[0]["content"]
                self.assertIn("Narrative agency and causal contract", system)
                self.assertIn("Keep the guardian suspicious and allow refusal", system)
                self.assertIn("The old map belongs to Mira", system)
                self.assertIn("never invent additional decisions", system)
                self.assertIn("Do not make NPCs flatter", system)
                self.assertEqual(packet[-1]["role"], "user")
                self.assertIn("Give me the map", packet[-1]["content"])

    def app(self):
        return self.cm.app


if __name__ == "__main__":
    unittest.main()
