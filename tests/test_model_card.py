"""Model Hub: bounded, pinned-revision Hugging Face model cards."""
import sys
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.catalog import HfCatalog
from noble_api.main import create_app

SHA = "a" * 40
LONG_SHA = "b" * 40


class ModelCardTests(unittest.TestCase):
    def test_readme_is_lazy_text_and_revision_pinned(self):
        requests = []
        def fake(req: httpx.Request):
            requests.append(req)
            if req.url.path == f"/demo/model/resolve/{SHA}/README.md":
                return httpx.Response(200, content=b"# Demo model\nExperimental **markdown**.\n")
            if req.url.path == f"/demo/model/resolve/{LONG_SHA}/README.md":
                return httpx.Response(200, content=b"Z" * (128 * 1024 + 4000))
            return httpx.Response(404)

        with tempfile.TemporaryDirectory() as temp:
            app = create_app(Path(temp), catalog_transport=httpx.MockTransport(fake))
            with TestClient(app) as client:
                result = client.get("/api/v1/model-cards/demo/model",
                                    params={"revision": SHA})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()["readme"], "# Demo model\nExperimental **markdown**.\n")
                self.assertTrue(result.json()["available"])
                self.assertFalse(result.json()["truncated"])
                second = client.get("/api/v1/model-cards/demo/model",
                                     params={"revision": SHA})
                self.assertEqual(second.status_code, 200)
                self.assertEqual(len(requests), 1, "Card must be cached by pinned revision")
                long_card = client.get("/api/v1/model-cards/demo/model",
                                       params={"revision": LONG_SHA})
                self.assertEqual(long_card.status_code, 200, long_card.text)
                self.assertEqual(len(long_card.json()["readme"].encode()), 128 * 1024)
                self.assertTrue(long_card.json()["truncated"])
                missing = client.get("/api/v1/model-cards/demo/unknown",
                                     params={"revision": SHA})
                self.assertEqual(missing.status_code, 200)
                self.assertFalse(missing.json()["available"])
                self.assertEqual(missing.json()["readme"], "")

    def test_invalid_input_never_contacts_hugging_face(self):
        attempts = []
        def fake(req):
            attempts.append(req)
            return httpx.Response(200, content=b"DO NOT READ")
        with tempfile.TemporaryDirectory() as temp:
            app = create_app(Path(temp), catalog_transport=httpx.MockTransport(fake))
            with TestClient(app) as client:
                for revision in ("main", "HEAD", "bad", "z" * 40):
                    response = client.get("/api/v1/model-cards/demo/model",
                                          params={"revision": revision})
                    self.assertEqual(response.status_code, 400, response.text)
                path = client.get("/api/v1/model-cards/demo/%2E%2E",
                                  params={"revision": SHA})
                self.assertIn(path.status_code, (400, 404))
        self.assertFalse(attempts, "Unsafe identifiers must not reach the remote host")

    def test_restricted_readme_reports_http_error(self):
        def fake(req):
            return httpx.Response(403)
        with tempfile.TemporaryDirectory() as temp:
            app = create_app(Path(temp), catalog_transport=httpx.MockTransport(fake))
            with TestClient(app) as client:
                result = client.get("/api/v1/model-cards/demo/model",
                                    params={"revision": SHA})
                self.assertEqual(result.status_code, 403)
                self.assertIn("restricted", str(result.json()).lower())


if __name__ == "__main__":
    unittest.main()
