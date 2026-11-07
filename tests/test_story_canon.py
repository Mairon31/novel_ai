"""Canon storage and streaming status regression tests, independent of actual GPU."""
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app  # noqa: E402


def fake_narrator(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/v1/models":
        return httpx.Response(200,json={"data":[{"id":"fixture-4b"}]})
    if request.url.path == "/v1/chat/completions":
        content=('data: {"choices":[{"delta":{"content":"La torre seguía intacta."}}]}\n\n'
                 'data: [DONE]\n\n')
        return httpx.Response(200,text=content,headers={"content-type":"text/event-stream"})
    return httpx.Response(404)


class CanonTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.transport=httpx.MockTransport(fake_narrator)
        self.app=create_app(Path(self.temp.name),llm_transport=self.transport)
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        self.story=self.client.post("/api/v1/stories",json={
            "title":"Torre de Aira",
            "premise":"Una joven hechicera investiga una torre bajo las estrellas."}).json()["id"]

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.temp.cleanup()

    def test_canon_is_not_lost_after_restart_and_augments_context(self):
        canon="Aira es la única que conoce el nombre real del dragón."
        result=self.client.patch(f"/api/v1/stories/{self.story}/canon",json={"canon":canon})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()["canon"],canon)
        app2=create_app(Path(self.temp.name),llm_transport=self.transport)
        with TestClient(app2) as second:
            story=second.get(f"/api/v1/stories/{self.story}").json()
            self.assertEqual(story["canon"],canon)
            messages=app2.state.narrative.messages(story,"continuar","continue")
            self.assertIn(canon,messages[0]["content"])
            self.assertIn("Confirmed persistent story canon",messages[0]["content"])
            self.assertIn("Protagonist",messages[0]["content"])
        bad=self.client.patch(f"/api/v1/stories/{self.story}/canon",json={"canon":"x"*5001})
        self.assertEqual(bad.status_code,422)
        self.assertEqual(self.client.get(f"/api/v1/stories/{self.story}").json()["canon"],canon)

    def test_narrative_emits_status_without_extra_model_requests(self):
        response=self.client.put("/api/v1/narrative/config",json={
            "provider":"koboldcpp","base_url":"http://127.0.0.1:5001",
            "model":"fixture-4b"})
        self.assertEqual(response.status_code,200,response.text)
        result=self.client.post(f"/api/v1/stories/{self.story}/generate",json={
            "mode":"continue","input_text":"","request_id":str(uuid.uuid4())})
        self.assertEqual(result.status_code,200,result.text)
        self.assertIn("event: status",result.text)
        self.assertIn('"phase": "preparing"',result.text)
        self.assertIn('"phase": "connecting"',result.text)
        self.assertIn('"phase": "streaming"',result.text)
        self.assertIn("event: done",result.text)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/turns").json()["turns"]),1)


if __name__=="__main__":
    unittest.main()
