"""Offline checkpoint installer contract: trust, integrity, resume and Comfy bridge."""
import hashlib
import json
import struct
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402

REPO = "artist/fantasy-checkpoint"
FILE = "fantasy-anime.safetensors"
REV = "c" * 40
HEADER = json.dumps({"weight": {
    "dtype": "F32", "shape": [1], "data_offsets": [0, 4],
}}).encode()
VALID = struct.pack("<Q", len(HEADER)) + HEADER + struct.pack("<f", .4)


class FakeCheckpointHF:
    def __init__(self):
        self.bytes = VALID
        self.digest = hashlib.sha256(self.bytes).hexdigest()
        self.sha_enabled = True
        self.gated = False
        self.partial = False
        self.started = threading.Event()
        self.release = threading.Event()
        self.requests = []

    def __call__(self, request: httpx.Request):
        path = request.url.path
        self.requests.append((path, request.headers.get("range")))
        if path == "/api/models/" + REPO:
            return httpx.Response(200, json={
                "sha": REV, "gated": self.gated, "cardData": {"license": "openrail"},
                "siblings": [{"rfilename": FILE, "size": len(self.bytes),
                              "lfs": {"oid": self.digest if self.sha_enabled else ""}},
                             {"rfilename": "../unsafe.safetensors", "size": 1024,
                              "lfs": {"oid": self.digest}}],
            })
        if path == f"/{REPO}/resolve/{REV}/{FILE}":
            start = int(request.headers["range"][6:-1]) if "range" in request.headers else 0
            if start:
                return httpx.Response(206, content=self.bytes[start:], headers={
                    "Content-Range": f"bytes {start}-{len(self.bytes)-1}/{len(self.bytes)}"})
            if self.partial:
                owner = self
                first = 28

                class Pausable(httpx.SyncByteStream):
                    def __iter__(self):
                        yield owner.bytes[:first]
                        owner.started.set()
                        if not owner.release.wait(8):
                            raise RuntimeError("Test fake download did not resume")
                        yield owner.bytes[first:]

                return httpx.Response(200, stream=Pausable())
            return httpx.Response(200, content=self.bytes)
        return httpx.Response(404)


class CheckpointInstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.fake = FakeCheckpointHF()
        self.app = create_app(self.root, catalog_transport=httpx.MockTransport(self.fake))
        self.scope = TestClient(self.app)
        self.client = self.scope.__enter__()
        self.target = self.root / "models/comfyui/checkpoints" / REPO / FILE

    def tearDown(self):
        self.fake.release.set()
        self.scope.__exit__(None, None, None)
        self.tmp.cleanup()

    def inspect(self):
        return self.client.get("/api/v1/images/checkpoints/lookup",
                               params={"repo_id": REPO})

    def start(self):
        response = self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": REV})
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()["id"]

    def wait(self, job_id, terminal=("completed", "failed", "paused", "cancelled")):
        limit = time.monotonic() + 7
        while time.monotonic() < limit:
            response = self.client.get("/api/v1/images/checkpoints/downloads/" + job_id)
            self.assertEqual(response.status_code, 200)
            job = response.json()
            if job["status"] in terminal:
                return job
            time.sleep(.02)
        self.fail("Checkpoint job did not settle")

    def test_lookup_verified_install_manifest_and_no_implicit_download(self):
        files = self.client.get("/api/v1/images/checkpoints/installed").json()
        self.assertEqual(files["models"], [])
        self.assertFalse(self.fake.requests, "No HF request when opening settings")
        self.assertIn("--extra-model-paths-config", files["comfyui_argument"])
        bridge = Path(files["config_path"])
        self.assertTrue(bridge.is_file())
        self.assertIn("checkpoints: checkpoints", bridge.read_text())
        found = self.inspect()
        self.assertEqual(found.status_code, 200, found.text)
        self.assertEqual(found.json()["license"], "openrail")
        self.assertEqual(len(found.json()["models"]), 1)
        self.assertFalse(self.target.exists())
        job = self.wait(self.start())
        self.assertEqual(job["status"], "completed", job["error"])
        self.assertEqual(job["received_bytes"], len(VALID))
        self.assertEqual(self.target.read_bytes(), VALID)
        listing = self.client.get("/api/v1/images/checkpoints/installed").json()
        self.assertEqual(listing["models"][0]["checkpoint_name"], REPO + "/" + FILE)
        self.assertEqual(self.inspect().json()["models"][0]["installed"], True)
        self.assertEqual(self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": REV}).status_code, 409)
        self.assertFalse(self.client.get("/api/v1/images/status").json()["online"])
        self.assertFalse((self.root / "story-assets").exists())

    def test_malformed_or_unverified_artifacts_cannot_be_installed(self):
        self.fake.sha_enabled = False
        self.assertEqual(self.inspect().json()["models"], [])
        denied = self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": REV})
        self.assertEqual(denied.status_code, 422, denied.text)
        self.fake.sha_enabled = True
        self.fake.gated = True
        self.assertEqual(self.inspect().status_code, 403)
        self.fake.gated = False
        for bad in ("../../etc/passwd.safetensors", "evil.gguf", ".hidden.safetensors"):
            response = self.client.post("/api/v1/images/checkpoints/install", json={
                "repo_id": REPO, "filename": bad, "revision": REV})
            self.assertEqual(response.status_code, 422, (bad, response.text))
        self.assertEqual(self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": "z" * 40}).status_code, 422)
        self.assertFalse(self.target.exists())

    def test_checksum_mismatch_or_bad_safetensors_never_publishes(self):
        announced = self.fake.digest
        self.fake.digest = "0" * 64
        first = self.wait(self.start())
        self.assertEqual(first["status"], "failed")
        self.assertIn("SHA-256", first["error"])
        self.assertFalse(self.target.exists())
        self.fake.digest = announced
        self.fake.bytes = b"<html>download failed</html>" + b" " * 100
        self.fake.digest = hashlib.sha256(self.fake.bytes).hexdigest()
        second = self.wait(self.start())
        self.assertEqual(second["status"], "failed")
        self.assertIn("safetensors", second["error"])
        self.assertFalse(self.target.exists())

    def test_pause_and_resume_use_range_without_redownloading(self):
        self.fake.partial = True
        job_id = self.start()
        self.assertTrue(self.fake.started.wait(3))
        paused = self.client.post(
            "/api/v1/images/checkpoints/downloads/" + job_id + "/pause")
        self.assertEqual(paused.status_code, 200)
        self.assertEqual(paused.json()["status"], "paused")
        self.fake.release.set()
        resumed = self.client.post(
            "/api/v1/images/checkpoints/downloads/" + job_id + "/resume")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(self.wait(job_id)["status"], "completed")
        self.assertEqual(self.target.read_bytes(), VALID)
        self.assertTrue(any(r and r.startswith("bytes=") for _, r in self.fake.requests))

    def test_cancel_and_symlinked_target_do_not_write(self):
        self.fake.partial = True
        job_id = self.start()
        self.assertTrue(self.fake.started.wait(3))
        canceled = self.client.post(
            "/api/v1/images/checkpoints/downloads/" + job_id + "/cancel")
        self.assertEqual(canceled.status_code, 200)
        self.fake.release.set()
        self.assertEqual(self.wait(job_id)["status"], "cancelled")
        self.assertFalse(self.target.exists())
        # A user-managed path must not be silently overwritten or traversed.
        self.target.parent.mkdir(parents=True)
        manual = self.target
        manual.write_bytes(b"user-owned model")
        blocked = self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": REV})
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(manual.read_bytes(), b"user-owned model")

    def test_symlinked_repository_directory_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "models/comfyui/checkpoints/artist").symlink_to(
            outside, target_is_directory=True)
        result = self.client.post("/api/v1/images/checkpoints/install", json={
            "repo_id": REPO, "filename": FILE, "revision": REV})
        self.assertEqual(result.status_code, 409)
        self.assertFalse(list(outside.iterdir()))


if __name__ == "__main__":
    unittest.main()
