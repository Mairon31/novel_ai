"""Narrative provider integration tests: fake LOCAL engines, not real GPU inferencing."""
import asyncio
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


class SimulatedLocalEngine:
    def __init__(self):
        self.requests = []
        self.fail_generation = False

    def __call__(self, request: httpx.Request):
        self.requests.append(request)
        path = request.url.path
        if path == "/api/tags":
            return httpx.Response(200, json={"models": [
                {"name": "qwen3:8b"}, {"name": "gemma3:4b"}]})
        if path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "local-gguf"}]})
        if path == "/api/chat":
            if self.fail_generation:
                return httpx.Response(500, text="engine unavailable")
            content = "\n".join(json.dumps(item) for item in [
                {"message": {"content": "La bibliotecaria "}, "done": False},
                {"message": {"content": "abre la puerta."}, "done": False},
                {"done": True},
            ]) + "\n"
            return httpx.Response(200, content=content,
                                  headers={"content-type":"application/x-ndjson"})
        if path == "/v1/chat/completions":
            if self.fail_generation:
                return httpx.Response(503, text="model not ready")
            content = ('data: {"choices":[{"delta":{"content":"El bosque "}}]}\n\n'
                       'data: {"choices":[{"delta":{"content":"responde."}}]}\n\n'
                       'data: [DONE]\n\n')
            return httpx.Response(200, content=content,
                                  headers={"content-type": "text/event-stream"})
        return httpx.Response(404)


class NarrativeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-story-")
        self.engine = SimulatedLocalEngine()
        self.app = create_app(Path(self.tmp.name),
                              llm_transport=httpx.MockTransport(self.engine))
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.tmp.cleanup()

    def settings(self, **overrides):
        payload = {
            "provider": "ollama", "base_url": "http://127.0.0.1:11434",
            "model": "qwen3:8b", "temperature": 0.6, "top_p": 0.9,
            "num_ctx": 4096, "max_tokens": 180, "device": "auto",
        }
        payload.update(overrides)
        return self.client.put("/api/v1/narrative/config", json=payload)

    def story(self):
        res = self.client.post("/api/v1/stories",
                               json={"title": "Torre de Airi",
                                     "premise": "Una joven hechicera custodia una torre encantada."})
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()["id"]

    def test_local_only_urls_and_device_capability_validation(self):
        self.assertEqual(self.settings(base_url="http://evil.example:80").status_code, 422)
        self.assertEqual(self.settings(base_url="http://127.0.0.1:11434/admin").status_code, 422)
        self.assertEqual(self.settings(base_url="http://127.0.0.1:11434@evil.com:80").status_code, 422)
        self.assertEqual(self.settings(provider="koboldcpp", device="cpu").status_code, 422)
        self.assertEqual(self.settings(device="cpu").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/narrative/config").json()["device"], "cpu")

    def test_ollama_discovery_and_real_protocol_stream_commit(self):
        self.assertEqual(self.settings().status_code, 200)
        models = self.client.get("/api/v1/narrative/models").json()
        self.assertTrue(models["online"])
        self.assertEqual(models["models"], ["qwen3:8b", "gemma3:4b"])
        story_id = self.story()
        request_id = str(uuid.uuid4())
        stream = self.client.post(f"/api/v1/stories/{story_id}/generate",
                                  json={"mode":"do", "input_text":"Abro la puerta",
                                        "request_id": request_id})
        self.assertEqual(stream.status_code, 200, stream.text)
        self.assertIn("event: delta", stream.text)
        self.assertIn("event: done", stream.text)
        self.assertIn("La bibliotecaria", stream.text)
        rows = self.client.get(f"/api/v1/stories/{story_id}/turns").json()["turns"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["request_id"], request_id)
        self.assertEqual(rows[0]["assistant_text"], "La bibliotecaria abre la puerta.")
        upstream = next(r for r in self.engine.requests if r.url.path == "/api/chat")
        body = json.loads(upstream.content)
        self.assertEqual(body["model"], "qwen3:8b")
        self.assertEqual(body["messages"][-1]["role"], "user")
        self.assertEqual(body["options"]["num_ctx"], 4096)

        again = self.client.post(f"/api/v1/stories/{story_id}/generate",
                                 json={"mode":"do", "input_text":"Abro la puerta",
                                       "request_id": request_id})
        self.assertIn('"replayed": true', again.text)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{story_id}/turns").json()["turns"]), 1)
        self.assertEqual(sum(r.url.path == "/api/chat" for r in self.engine.requests), 1)

    def test_kobold_openai_sse_stream_and_continue(self):
        self.assertEqual(self.settings(provider="koboldcpp",
                          base_url="http://127.0.0.1:5001",
                          model="local-gguf").status_code, 200)
        listed = self.client.get("/api/v1/narrative/models").json()
        self.assertEqual(listed["models"], ["local-gguf"])
        s = self.story()
        result = self.client.post(f"/api/v1/stories/{s}/generate",
                                  json={"mode":"continue", "input_text":"",
                                        "request_id": str(uuid.uuid4())})
        self.assertIn("event: done", result.text)
        rows = self.client.get(f"/api/v1/stories/{s}/turns").json()["turns"]
        self.assertEqual(rows[0]["assistant_text"], "El bosque responde.")
        packet = json.loads(next(
            r for r in self.engine.requests
            if r.url.path == "/v1/chat/completions").content)
        self.assertEqual(packet["model"], "local-gguf")
        self.assertTrue(packet["stream"])

    def test_engine_error_and_empty_input_do_not_commit_turn(self):
        self.settings()
        s = self.story()
        self.engine.fail_generation = True
        result = self.client.post(f"/api/v1/stories/{s}/generate",
                                  json={"mode":"say", "input_text":"Hola",
                                        "request_id": str(uuid.uuid4())})
        self.assertIn("event: error", result.text)
        self.assertNotIn("event: done", result.text)
        self.assertEqual(self.client.get(f"/api/v1/stories/{s}/turns").json()["turns"], [])
        rejected = self.client.post(f"/api/v1/stories/{s}/generate",
                                    json={"mode":"say", "input_text":"",
                                          "request_id": str(uuid.uuid4())})
        self.assertEqual(rejected.status_code, 422)

    def test_disconnect_between_tokens_prevents_commit_and_releases_gpu(self):
        self.assertEqual(self.settings().status_code, 200)
        story_id = self.story()
        request_id = str(uuid.uuid4())
        checks = 0
        async def disconnected():
            nonlocal checks
            checks += 1
            return checks >= 3
        async def consume():
            return [event async for event in self.app.state.narrative.stream_turn(
                story_id, request_id, "do", "Abro la puerta", disconnected=disconnected)]
        events = asyncio.run(consume())
        self.assertTrue(any("event: delta" in event for event in events), events)
        self.assertFalse(any("event: done" in event for event in events))
        self.assertEqual(self.app.state.narrative.turns(story_id), [])
        self.assertIsNone(self.app.state.resources.active_workload()["active"])
        # The exact idempotency key remains retryable after cancellation.
        retry = self.client.post(f"/api/v1/stories/{story_id}/generate", json={
            "mode": "do", "input_text": "Abro la puerta", "request_id": request_id})
        self.assertIn("event: done", retry.text)
        self.assertEqual(len(self.app.state.narrative.turns(story_id)), 1)

    def test_closing_sse_generator_after_delta_rolls_back_unfinished_turn(self):
        self.assertEqual(self.settings().status_code, 200)
        story_id = self.story()
        request_id = str(uuid.uuid4())
        async def cancel_after_first_delta():
            stream = self.app.state.narrative.stream_turn(
                story_id, request_id, "do", "Abro la puerta")
            try:
                async for event in stream:
                    if "event: delta" in event:
                        return
            finally:
                await stream.aclose()
        asyncio.run(cancel_after_first_delta())
        self.assertEqual(self.app.state.narrative.turns(story_id), [])
        self.assertIsNone(self.app.state.resources.active_workload()["active"])

    def test_story_survives_restart(self):
        self.settings()
        s = self.story()
        self.client.post(f"/api/v1/stories/{s}/generate",
                         json={"mode":"story","input_text":"Una tormenta aparece",
                               "request_id": str(uuid.uuid4())})
        # New API application bound to same SQLite data dir.
        app2 = create_app(Path(self.tmp.name),
                          llm_transport=httpx.MockTransport(self.engine))
        with TestClient(app2) as c2:
            self.assertEqual(c2.get("/api/v1/narrative/config").json()["model"], "qwen3:8b")
            self.assertEqual(len(c2.get(f"/api/v1/stories/{s}/turns").json()["turns"]), 1)
            self.assertEqual(len(c2.get("/api/v1/stories").json()["stories"]), 1)


if __name__ == "__main__":
    unittest.main()
