"""App preferences, release channels and cloud LLM credential boundary."""
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

calls = []

def fake_release(request):
    assert request.url.host == "api.github.com"
    return httpx.Response(200, json=[
        {"tag_name": "v0.9.0", "prerelease": False, "draft": False,
         "name": "Stable", "published_at": "2026-11-01T00:00:00Z",
         "html_url": "https://github.com/Mairon31/novel_ai/releases/tag/v0.9.0"},
        {"tag_name": "v1.0.0-beta.1", "prerelease": True, "draft": False,
         "name": "Beta", "published_at": "2026-11-02T00:00:00Z",
         "html_url": "https://github.com/Mairon31/novel_ai/releases/tag/v1.0.0-beta.1"},
        {"tag_name": "v1.0.0-nightly.11", "prerelease": True, "draft": False,
         "name": "Nightly", "published_at": "2026-11-03T00:00:00Z",
         "html_url": "https://github.com/Mairon31/novel_ai/releases/tag/v1.0.0-nightly.11"},
    ])

def fake_cloud(request):
    calls.append(request)
    if request.url.path == "/api/v1/models":
        return httpx.Response(200, json={"data": [{"id": "demo/model"}]})
    if request.url.path == "/api/v1/chat/completions":
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Una escena."}}]}\n\ndata: [DONE]\n\n')
    return httpx.Response(404)

class PreferencesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name),
            control_transport=httpx.MockTransport(fake_release),
            llm_transport=httpx.MockTransport(fake_cloud))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_settings_persist_and_bad_options_rejected(self):
        start = self.client.get("/api/v1/workspace/preferences").json()
        self.assertEqual(start["target_language"], "es-419")
        change = self.client.patch("/api/v1/workspace/preferences",
                                   json={"target_language": "ja", "accent": "teal",
                                         "update_channel": "beta", "font_scale": 115})
        self.assertEqual(change.status_code, 200, change.text)
        self.assertEqual(change.json()["accent"], "teal")
        invalid = self.client.patch("/api/v1/workspace/preferences",
                                    json={"target_language": "INVALID"})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.client.get("/api/v1/workspace/preferences").json()["target_language"], "ja")
        self.assertEqual(self.client.patch("/api/v1/workspace/preferences",
                                          json={"unknown": "bad"}).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/about").json()["channel"], "beta")

    def test_release_selection_and_readonly_diagnostics(self):
        self.assertEqual(self.client.get("/api/v1/updates").json()["release"]["version"], "v0.9.0")
        self.client.patch("/api/v1/workspace/preferences", json={"update_channel": "beta"})
        result = self.client.get("/api/v1/updates").json()
        self.assertEqual(result["release"]["version"], "v1.0.0-beta.1")
        self.assertFalse(result["update_available"])  # source checkout isn't an installable build
        self.client.patch("/api/v1/workspace/preferences", json={"update_channel": "nightly"})
        self.assertEqual(self.client.get("/api/v1/updates").json()["release"]["channel"], "nightly")
        self.assertEqual(self.client.get("/api/v1/runtime/diagnostics").json()["updatable_from_app"], False)
        self.assertEqual(self.client.get("/api/v1/network/capabilities").json()["mode"], "loopback_only")

    def test_cloud_credentials_environment_not_returned(self):
        with patch.dict(os.environ, {"NOBLE_OPENROUTER_API_KEY": "test-secret-not-for-users"}):
            status = self.client.get("/api/v1/provider-credentials/openrouter").json()
            self.assertTrue(status["configured"])
            self.assertNotIn("test-secret", json.dumps(status))
            config = self.client.get("/api/v1/narrative/config").json()
            config.update({"provider": "openrouter", "base_url": "http://evil:3000",
                           "model": "demo/model"})
            saved = self.client.put("/api/v1/narrative/config", json=config)
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(saved.json()["base_url"], "https://openrouter.ai/api/v1")
            models = self.client.get("/api/v1/narrative/models").json()
            self.assertEqual(models["models"], ["demo/model"])
            story = self.client.post("/api/v1/stories", json={
                "title": "Nube", "premise": "Una maga llega a la escuela."}).json()
            self.client.patch("/api/v1/workspace/preferences", json={
                "target_language": "ja", "narration_style": "literary"})
            result = self.client.post(f'/api/v1/stories/{story["id"]}/generate',
                json={"mode": "continue", "input_text": "",
                      "request_id": str(uuid.uuid4())})
            self.assertIn("event: done", result.text)
            upstream = next(r for r in calls if r.url.path == "/api/v1/chat/completions")
            self.assertEqual(upstream.headers["Authorization"], "Bearer test-secret-not-for-users")
            body = json.loads(upstream.content)
            self.assertIn("ja", body["messages"][0]["content"])
            self.assertEqual(body["model"], "demo/model")
            self.assertNotIn("test-secret-not-for-users", self.client.get(
                "/api/v1/workspace/preferences").text)
