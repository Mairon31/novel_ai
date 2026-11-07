"""Context inspector returns exactly the prepared messages, without inference."""
from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


class ContextInspectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-prompt-inspector-")
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "El diario del faro",
            "premise": "Una exploradora descubre un palacio perdido junto al faro.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.url = f"/api/v1/stories/{self.story}/context/preview"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def preview(self, text="Inspecciono el faro", mode="do"):
        return self.client.post(self.url, json={
            "input_text": text, "mode": mode,
        })

    def test_exact_messages_and_no_writes_or_remote_model_calls(self):
        self.client.put(f"/api/v1/stories/{self.story}/creator", json={
            "ai_plot": "La guardiana conserva un secreto dentro del faro.",
            "reminder": "No decidir acciones del jugador.",
        })
        before = self.client.get(f"/api/v1/stories/{self.story}/turns").json()["turns"]
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        expected = self.app.state.narrative.messages(
            self.app.state.narrative.get_story(self.story),
            "Inspecciono el faro", "do")
        self.assertEqual(result["messages"], expected)
        self.assertIn("La guardiana conserva un secreto", result["messages"][0]["content"])
        self.assertEqual(result["messages"][-1]["role"], "user")
        self.assertEqual(result["context_window_tokens"], 4096)
        self.assertEqual(result["reserved_output_tokens"], 450)
        self.assertEqual(result["estimated_total_tokens"],
                         result["estimated_prompt_tokens"] + 450)
        self.assertFalse(result["token_counts_exact"])
        self.assertFalse(result["runtime_kv_cache_measured"])
        self.assertEqual(sum(x["characters"] for x in result["sections"]),
                         result["total_characters"])
        self.assertTrue(any(section["name"] == "Creator and characters"
                            for section in result["sections"]))
        self.assertTrue(any(section["name"] == "Premise and protagonist"
                            for section in result["sections"]))
        after = self.client.get(f"/api/v1/stories/{self.story}/turns").json()["turns"]
        self.assertEqual(before, after)

    def test_context_overflow_is_estimated_not_claimed_as_exact(self):
        response = self.client.put(
            f"/api/v1/stories/{self.story}/creator",
            json={"ai_plot": "Un texto muy largo de historia " * 380})
        self.assertEqual(response.status_code, 200, response.text)
        config = self.client.get("/api/v1/narrative/config").json()
        config["num_ctx"] = 512
        config["max_tokens"] = 450
        saved = self.client.put("/api/v1/narrative/config", json=config)
        self.assertEqual(saved.status_code, 200, saved.text)
        result = self.preview().json()
        self.assertTrue(result["estimated_overflow"])
        self.assertGreater(result["estimated_total_tokens"], 512)
        self.assertIn("not a model tokenizer", result["token_estimate_method"])

    def test_validation_and_story_ownership(self):
        self.assertEqual(self.preview("").status_code, 422)
        self.assertEqual(self.preview("texto", "invalid").status_code, 422)
        self.assertEqual(self.preview("a" * 3001).status_code, 422)
        self.assertEqual(self.preview("", mode="continue").status_code, 200)
        unknown = self.client.post(
            f"/api/v1/stories/{uuid.uuid4()}/context/preview",
            json={"input_text": "Camino", "mode": "do"})
        self.assertEqual(unknown.status_code, 404)


if __name__ == "__main__":
    unittest.main()
