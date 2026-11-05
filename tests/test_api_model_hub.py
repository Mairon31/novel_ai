"""P0.5 offline contract tests: MOCK Hugging Face transport, NOT live network/GPU."""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.main import ROOT as APP_ROOT, create_app  # noqa: E402

PAYLOAD = b"GGUF" + b"model-test-bytes" * 100
SHA = hashlib.sha256(PAYLOAD).hexdigest()
REV = "a" * 40
REPO = "noble-test/tiny-gguf"


def hf_mock(request: httpx.Request):
    path = request.url.path
    if path == "/api/models":
        return httpx.Response(200, json=[{
            "id": REPO, "sha": REV, "downloads": 123,
            "pipeline_tag": "text-generation", "gated": False,
            "cardData": {"license": "apache-2.0"},
        }])
    if path == "/api/models/" + REPO:
        return httpx.Response(200, json={
            "id": REPO, "sha": REV, "gated": False,
            "cardData": {"license": "apache-2.0"},
            "siblings": [{"rfilename": "tiny.Q4_K_M.gguf", "size": len(PAYLOAD),
                          "lfs": {"oid": SHA, "size": len(PAYLOAD)}}],
        })
    if path == "/" + REPO + "/resolve/" + REV + "/tiny.Q4_K_M.gguf":
        range_header = request.headers.get("range")
        if range_header:
            start = int(range_header.removeprefix("bytes=").removesuffix("-"))
            return httpx.Response(206, content=PAYLOAD[start:],
                headers={"Content-Range": "bytes " + str(start) + "-" +
                         str(len(PAYLOAD)-1) + "/" + str(len(PAYLOAD))})
        return httpx.Response(200, content=PAYLOAD)
    return httpx.Response(404, json={"error": "Not found"})


class ModelHubApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-test-")
        self.app = create_app(Path(self.temp.name),
                              catalog_transport=httpx.MockTransport(hf_mock))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def test_application_root_for_static_bundle(self):
        self.assertEqual(APP_ROOT, ROOT)
        self.assertTrue((APP_ROOT / "apps" / "web" / "index.html").is_file())

    def test_startup_without_models_and_tts_off(self):
        self.assertEqual(self.client.get("/api/v1/health").status_code, 200)
        settings = self.client.get("/api/v1/settings").json()
        self.assertFalse(settings["setup_complete"])
        self.assertFalse(settings["tts_enabled"])
        self.assertFalse(settings["tts_autoread"])
        self.assertEqual(self.client.get("/api/v1/models/installed").json()["models"], [])
        hw = self.client.get("/api/v1/hardware").json()
        self.assertIn("cpu", hw["device_options"])
        self.assertIn("gpus", hw)

    def test_search_and_detail_are_actual_provider_contracts(self):
        response = self.client.get("/api/v1/models/search",
                                   params={"q": "tiny", "role": "narrator"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["repo_id"], REPO)
        detail = self.client.get("/api/v1/models/" + REPO)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["variants"][0]["sha256"], SHA)
        self.assertEqual(detail.json()["revision"], REV)

    def test_setup_persists_and_invalid_settings_rejected(self):
        changed = self.client.patch("/api/v1/settings",
            json={"setup_complete": True, "language": "es-419"})
        self.assertTrue(changed.json()["setup_complete"])
        invalid = self.client.patch("/api/v1/settings", json={"language": "inventado"})
        self.assertEqual(invalid.status_code, 422)
        self.assertTrue(self.client.get("/api/v1/settings").json()["setup_complete"])

    def test_validate_install_input_and_assign_requires_installed(self):
        invalid = self.client.post("/api/v1/models/install",
            json={"repo_id": REPO, "revision": REV, "filename": "../evil.gguf"})
        self.assertEqual(invalid.status_code, 400)
        missing = self.client.put("/api/v1/model-roles/narrator",
                                  json={"installed_id": "not-installed"})
        self.assertEqual(missing.status_code, 422)

    def test_download_verify_register_and_assign(self):
        install = self.client.post("/api/v1/models/install", json={
            "repo_id": REPO, "revision": REV, "filename": "tiny.Q4_K_M.gguf"})
        self.assertEqual(install.status_code, 202, install.text)
        job_id = install.json()["id"]
        duplicate = self.client.post("/api/v1/models/install", json={
            "repo_id": REPO, "revision": REV, "filename": "tiny.Q4_K_M.gguf"})
        self.assertEqual(duplicate.json()["id"], job_id)
        state = None
        for _ in range(100):
            state = self.client.get("/api/v1/downloads/" + job_id).json()
            if state["status"] in ("completed", "failed"):
                break
            time.sleep(.02)
        self.assertEqual(state["status"], "completed", state)
        models = self.client.get("/api/v1/models/installed").json()["models"]
        self.assertEqual(len(models), 1)
        self.assertEqual(models[0]["sha256"], SHA)
        self.assertEqual(models[0]["integrity_status"], "sha256_verified")
        self.assertEqual(Path(models[0]["filepath"]).read_bytes(), PAYLOAD)
        role = self.client.put("/api/v1/model-roles/narrator",
                               json={"installed_id": models[0]["id"]})
        self.assertEqual(role.status_code, 200)
        self.assertFalse(role.json()["runtime_connected"])

    def test_resume_rejects_malformed_or_inconsistent_http_range(self):
        from noble_api.downloads import DownloadManager
        from noble_api.store import Store
        from noble_api.catalog import HfCatalog
        broken = [
            ("wrong-start", "bytes 31-{}/{}".format(len(PAYLOAD) - 1, len(PAYLOAD))),
            ("wrong-total", "bytes 30-{}/{}".format(len(PAYLOAD) - 1, len(PAYLOAD) + 99)),
            ("invalid", "bytes 30-/{}".format(len(PAYLOAD))),
        ]
        for label, header in broken:
            with self.subTest(label=label):
                def transport(request: httpx.Request):
                    if "/resolve/" in request.url.path:
                        return httpx.Response(206, content=PAYLOAD[30:],
                                              headers={"Content-Range": header})
                    return hf_mock(request)
                store = Store(Path(self.temp.name) / ("range-" + label))
                catalog = HfCatalog(httpx.MockTransport(transport))
                manager = DownloadManager(store, catalog)
                part = (store.models_dir / "hf" / REPO / REV / "tiny.Q4_K_M.gguf.part")
                part.parent.mkdir(parents=True, exist_ok=True)
                part.write_bytes(PAYLOAD[:30])
                job, _ = store.enqueue(REPO, REV, "tiny.Q4_K_M.gguf", len(PAYLOAD), SHA)
                try:
                    manager._run(job["id"])
                    state = store.download(job["id"])
                    self.assertEqual(state["status"], "failed", state)
                    self.assertTrue("rango" in state["error"].lower() or
                                    "content-range" in state["error"].lower(), state)
                    self.assertEqual(part.read_bytes(), PAYLOAD[:30])
                    self.assertEqual(store.installed(), [])
                finally:
                    manager.shutdown()
                    catalog.close()

    def test_partial_response_without_range_request_is_not_accepted(self):
        from noble_api.downloads import DownloadManager
        from noble_api.store import Store
        from noble_api.catalog import HfCatalog
        def transport(request: httpx.Request):
            if "/resolve/" in request.url.path:
                return httpx.Response(206, content=PAYLOAD[10:],
                    headers={"Content-Range": "bytes 10-{}/{}".format(
                        len(PAYLOAD) - 1, len(PAYLOAD))})
            return hf_mock(request)
        store = Store(Path(self.temp.name) / "unexpected-206")
        catalog = HfCatalog(httpx.MockTransport(transport))
        manager = DownloadManager(store, catalog)
        job, _ = store.enqueue(REPO, REV, "tiny.Q4_K_M.gguf", len(PAYLOAD), SHA)
        try:
            manager._run(job["id"])
            state = store.download(job["id"])
            self.assertEqual(state["status"], "failed", state)
            self.assertEqual(store.installed(), [])
            partial = store.models_dir / "hf" / REPO / REV / "tiny.Q4_K_M.gguf.part"
            self.assertFalse(partial.exists())
        finally:
            manager.shutdown()
            catalog.close()

    def test_resume_from_partial_file(self):
        # HTTP 206 is handled, without duplicating bytes.
        from noble_api.downloads import DownloadManager
        from noble_api.store import Store
        from noble_api.catalog import HfCatalog
        root = Path(self.temp.name) / "resume"
        store = Store(root)
        cat = HfCatalog(httpx.MockTransport(hf_mock))
        dm = DownloadManager(store, cat)
        target = root / "models" / "hf" / REPO / REV / "tiny.Q4_K_M.gguf.part"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(PAYLOAD[:30])
        try:
            job = dm.install(REPO, REV, "tiny.Q4_K_M.gguf")
            for _ in range(100):
                updated = store.download(job["id"])
                if updated["status"] in ("completed", "failed"):
                    break
                time.sleep(.02)
            self.assertEqual(updated["status"], "completed", updated)
            self.assertEqual((target.parent / "tiny.Q4_K_M.gguf").read_bytes(), PAYLOAD)
        finally:
            dm.shutdown()
            cat.close()


if __name__ == "__main__":
    unittest.main()
