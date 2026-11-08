"""Interaction-mode protocol tests using a mocked local narrator.

These verify request serialization, persistence and mode-specific system rules.
A model's actual semantic compliance requires separate live evaluation.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402
from noble_api.narrative_agency import agency_directives  # noqa: E402


class MockNarrator:
    def __init__(self):
        self.requests = []

    def __call__(self, request: httpx.Request):
        if request.url.path == "/api/chat":
            self.requests.append(json.loads(request.content))
            line = json.dumps({"message": {"content": "The guardian considers the request."},
                               "done": False}) + "\n" + json.dumps({"done": True}) + "\n"
            return httpx.Response(200, content=line.encode("utf-8"),
                                  headers={"content-type": "application/x-ndjson"})
        return httpx.Response(404)


class ReaderModesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.provider = MockNarrator()
        self.app = create_app(Path(self.tmp.name),
                              llm_transport=httpx.MockTransport(self.provider))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        config = self.client.put("/api/v1/narrative/config", json={
            "provider": "ollama", "base_url": "http://127.0.0.1:11434",
            "model": "mock:1b", "temperature": 0.6, "top_p": 0.9,
            "num_ctx": 4096, "max_tokens": 150, "device": "auto",
        })
        self.assertEqual(config.status_code, 200, config.text)
        story = self.client.post("/api/v1/stories", json={
            "title": "Harbor secrets", "protagonist_name": "Lia",
            "premise": "The lighthouse keeper is guarding a secret harbor map.",
        })
        self.assertEqual(story.status_code, 201, story.text)
        self.story = story.json()["id"]
        self.url = f"/api/v1/stories/{self.story}/generate"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_new_modes_have_separate_consequences_and_no_telepathy(self):
        expected = {
            "think": ("not audible dialogue", "Other characters do not learn"),
            "observe": ("perceptible", "do not have the protagonist act"),
            "interact": ("attempt rather than guaranteed", "NPC goals"),
        }
        for mode, phrases in expected.items():
            with self.subTest(mode=mode):
                packet = agency_directives(mode, [])
                for phrase in phrases:
                    self.assertIn(phrase, packet)
                self.assertIn("Player agency", packet)
                self.assertIn("NPC agency", packet)
        self.assertNotEqual(agency_directives("think", []),
                            agency_directives("say", []))

    def test_sse_and_turn_history_preserve_each_new_mode(self):
        for mode, input_text in (
            ("think", "The keeper might be lying."),
            ("observe", "Study the lock and the marks beside the door."),
            ("interact", "Ask the keeper to show the sealed ledger."),
        ):
            with self.subTest(mode=mode):
                response = self.client.post(self.url, json={
                    "mode": mode, "input_text": input_text,
                    "request_id": str(uuid.uuid4()),
                })
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("event: done", response.text)
                sent = self.provider.requests[-1]["messages"]
                self.assertIn("Current interaction:", sent[0]["content"])
                self.assertIn(mode + ": " + input_text, sent[-1]["content"])
        history = self.client.get(f"/api/v1/stories/{self.story}/turns")
        self.assertEqual(history.status_code, 200)
        self.assertEqual([row["mode"] for row in history.json()["turns"]],
                         ["think", "observe", "interact"])

    def test_invalid_or_empty_new_mode_rejected_without_writing_turn(self):
        for mode in ("think", "observe", "interact", "invent"):
            with self.subTest(mode=mode):
                response = self.client.post(self.url, json={
                    "mode": mode, "input_text": "" if mode != "invent" else "hello",
                    "request_id": str(uuid.uuid4()),
                })
                self.assertEqual(response.status_code, 422, response.text)
        turns = self.client.get(f"/api/v1/stories/{self.story}/turns").json()["turns"]
        self.assertEqual(turns, [])


if __name__ == "__main__":
    unittest.main()
