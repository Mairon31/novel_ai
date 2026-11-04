"""Authenticated remote worker protocol tests — local mock Cloudflare API, no tunnel/GPU."""
import importlib
import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402

TOKEN = "noble-worker-test-very-secret-token-abcdef"

class FakeVault:
    def __init__(self):
        self.saved = {}

    def get(self, identity):
        return self.saved.get(identity, "")

    def set(self, identity, value):
        self.saved[identity] = value

    def delete(self, identity):
        self.saved.pop(identity, None)


def tunnel_server(request: httpx.Request):
    if request.headers.get("Authorization") != "Bearer " + TOKEN:
        return httpx.Response(401)
    if request.url.path == "/v1/models":
        return httpx.Response(200, json={"data": [{"id": "gpu-remote-gguf"}]})
    if request.url.path == "/v1/chat/completions":
        return httpx.Response(200, text=(
            'data: {"choices":[{"delta":{"content":"Desde la GPU remota."}}]}\n\n'
            'data: [DONE]\n\n'
        ))
    return httpx.Response(404)


def local_inference(request: httpx.Request):
    if request.url.path == "/v1/models":
        return httpx.Response(200, json={"data": [{"id": "gpu-remote-gguf"}]})
    if request.url.path == "/v1/chat/completions":
        return httpx.Response(200, text=(
            'data: {"choices":[{"delta":{"content":"Desde la GPU remota."}}]}\n\n'
            'data: [DONE]\n\n'
        ))
    return httpx.Response(404)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = FakeVault()
        self.app = create_app(
            Path(self.tmp.name), worker_transport=httpx.MockTransport(tunnel_server),
            llm_transport=httpx.MockTransport(tunnel_server), worker_vault=self.vault)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_worker_register_probe_activate_and_narrate(self):
        response = self.client.post("/api/v1/workers", json={
            "name": "GPU Colab", "url": "https://my-gpu.trycloudflare.com",
            "token": TOKEN})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertNotIn(TOKEN, response.text)
        worker_id = response.json()["id"]
        self.assertEqual(self.vault.get(worker_id), TOKEN)
        self.assertNotIn(TOKEN, json.dumps(self.client.get("/api/v1/workers").json()))
        probe = self.client.get("/api/v1/workers/" + worker_id + "/probe").json()
        self.assertTrue(probe["online"], probe)
        self.assertEqual(probe["models"], ["gpu-remote-gguf"])
        selected = self.client.post("/api/v1/workers/" + worker_id + "/activate",
                                    json={"model": "gpu-remote-gguf"})
        self.assertEqual(selected.status_code, 200, selected.text)
        self.assertEqual(selected.json()["provider"], "worker")
        story = self.client.post("/api/v1/stories", json={
            "title": "Mundo de Colab",
            "premise": "Una viajera entra en una biblioteca de un mundo desconocido."}).json()
        result = self.client.post("/api/v1/stories/" + story["id"] + "/generate",
            json={"request_id": str(uuid.uuid4()), "input_text": "",
                  "mode": "continue"})
        self.assertIn("Desde la GPU remota.", result.text)
        self.assertIn("event: done", result.text)
        deleted = self.client.delete("/api/v1/workers/" + worker_id)
        self.assertEqual(deleted.status_code, 204, deleted.text)
        self.assertEqual(self.vault.get(worker_id), "")

    def test_refuse_dangerous_or_unauthenticated_tunnels(self):
        for url in ["http://127.0.0.1:8000", "https://evil.example.com",
                    "https://gpu.trycloudflare.com/metadata", "https://gpu.trycloudflare.com@evil.com"]:
            self.assertEqual(self.client.post("/api/v1/workers", json={
                "name": "Bad worker", "url": url, "token": TOKEN}).status_code, 422)
        response = self.client.post("/api/v1/workers", json={
            "name": "Wrong key", "url": "https://my-gpu.trycloudflare.com",
            "token": "wrong-invalid-secret-token-long"})
        worker_id = response.json()["id"]
        probe = self.client.get("/api/v1/workers/" + worker_id + "/probe").json()
        self.assertFalse(probe["online"])

    def test_worker_server_requires_bearer_and_only_forwards_whitelist(self):
        with patch.dict(os.environ, {"NOBLE_WORKER_TOKEN": TOKEN,
                                      "NOBLE_WORKER_UPSTREAM": "http://127.0.0.1:5001"}):
            module = importlib.import_module("noble_api.worker_server")
        proxy = module.create_worker_app(
            TOKEN, "http://127.0.0.1:5001",
            transport=httpx.MockTransport(local_inference))
        with TestClient(proxy) as c:
            self.assertEqual(c.get("/v1/models").status_code, 401)
            headers = {"Authorization": "Bearer " + TOKEN}
            self.assertEqual(c.get("/v1/models", headers=headers).status_code, 200)
            result = c.post("/v1/chat/completions", headers=headers,
                json={"model":"gpu-remote-gguf", "messages":[
                    {"role":"user","content":"Comienza"}],"stream":True})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertIn("Desde la GPU remota.", result.text)
            self.assertEqual(c.get("/admin", headers=headers).status_code, 404)


if __name__ == "__main__":
    unittest.main()
