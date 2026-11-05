"""Explicit preparation is allowed; no warmup when simply opening the application."""
import sys
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app  # noqa: E402


class WarmupFixture:
    def __init__(self):
        self.generations=0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return httpx.Response(200,json={"data":[{"id":"fixture-4b"}]})
        if request.url.path == "/v1/chat/completions":
            self.generations+=1
            return httpx.Response(200,text=(
                'data: {"choices":[{"delta":{"content":"Listo."}}]}\n\n'
                'data: [DONE]\n\n'),headers={"content-type":"text/event-stream"})
        return httpx.Response(404)


class WarmupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.engine=WarmupFixture()
        self.app=create_app(Path(self.temp.name),
                            llm_transport=httpx.MockTransport(self.engine))
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.temp.cleanup()

    def test_only_explicit_prepare_loads_model(self):
        self.client.get("/api/v1/health")
        self.client.get("/api/v1/narrative/config")
        self.assertEqual(self.engine.generations,0)
        config=self.client.put("/api/v1/narrative/config",json={
            "provider":"koboldcpp", "base_url":"http://127.0.0.1:5001",
            "model":"fixture-4b"})
        self.assertEqual(config.status_code,200)
        self.assertEqual(self.engine.generations,0)
        prepared=self.client.post("/api/v1/narrative/prepare")
        self.assertEqual(prepared.status_code,200,prepared.text)
        self.assertEqual(prepared.json()["model"],"fixture-4b")
        self.assertTrue(prepared.json()["ready"])
        self.assertGreaterEqual(prepared.json()["duration_ms"],0)
        self.assertEqual(self.engine.generations,1)
        self.assertEqual(self.client.get("/api/v1/stories").json()["stories"],[])

    def test_blank_and_api_only_not_prepared(self):
        empty=self.client.post("/api/v1/narrative/prepare")
        self.assertEqual(empty.status_code,422)
        save=self.client.put("/api/v1/narrative/config",json={
            "provider":"openrouter","base_url":"https://openrouter.ai/api/v1",
            "model":"api-test"})
        self.assertEqual(save.status_code,200)
        result=self.client.post("/api/v1/narrative/prepare")
        self.assertEqual(result.status_code,422)
        self.assertEqual(self.engine.generations,0)


if __name__=="__main__":
    unittest.main()
