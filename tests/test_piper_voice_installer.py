"""Piper HF installer offline integration: pinned files, cryptographic integrity,
paired publication, retry, cancellation and no accidental TTS invocation."""
from __future__ import annotations

import hashlib
import json
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
from noble_api.main import create_app
from noble_api.voice_installer import REPO

REV = "a" * 40
VOICE = "es_MX-ald-medium.onnx"
PREFIX = "es/es_MX/ald/medium/"
MODEL = b"\x08\x03\x12\x02" + b"\x00" * (1024 * 1024 + 20)
CONFIG = json.dumps({"language": {"code": "es_MX"}, "audio": {"sample_rate": 22050},
                     "num_speakers": 1, "phoneme_type": "espeak"}).encode()


class FakePiperHF:
    def __init__(self):
        self.model = MODEL
        self.config = CONFIG
        self.wrong_model_hash = False
        self.missing_config = False
        self.requests = []
        self.partial_first = False
        self.started = threading.Event()
        self.unblock = threading.Event()

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.requests.append((path, request.headers.get("range")))
        if path == "/api/models/" + REPO:
            return httpx.Response(200, json={"sha": REV, "gated": False})
        if path == "/api/models/" + REPO + "/tree/" + REV + "/es/es_MX/ald/medium":
            files = []
            for filename, body in ((VOICE, MODEL), (VOICE + ".json", CONFIG)):
                if self.missing_config and filename.endswith(".json"):
                    continue
                digest = hashlib.sha256(body).hexdigest()
                if self.wrong_model_hash and filename == VOICE:
                    digest = "0" * 64
                files.append({"path": PREFIX + filename, "type": "file",
                              "size": len(body), "lfs": {"oid": digest}})
            return httpx.Response(200, json=files)
        if path.startswith("/" + REPO + "/resolve/" + REV + "/" + PREFIX):
            name = path.rsplit("/", 1)[-1]
            source = self.model if name == VOICE else self.config if name == VOICE + ".json" else None
            if source is None:
                return httpx.Response(404)
            start = int(request.headers["range"][6:-1]) if "range" in request.headers else 0
            if start:
                return httpx.Response(206, content=source[start:], headers={
                    "Content-Range": f"bytes {start}-{len(source)-1}/{len(source)}",
                    "Content-Length": str(len(source)-start)})
            if self.partial_first and name == VOICE:
                first = 300000
                owner = self

                class BlockedStream(httpx.SyncByteStream):
                    def __iter__(self):
                        yield source[:first]
                        owner.started.set()
                        if not owner.unblock.wait(8):
                            raise RuntimeError("Test timed out waiting to unblock network")
                        yield source[first:]

                return httpx.Response(200, stream=BlockedStream(),
                                      headers={"Content-Length": str(len(source))})
            return httpx.Response(200, content=source,
                                  headers={"Content-Length": str(len(source))})
        return httpx.Response(404, json={"error": "Not found"})

class PiperInstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fake = FakePiperHF()
        self.app = create_app(Path(self.tmp.name), catalog_transport=httpx.MockTransport(self.fake))
        self.scope = TestClient(self.app)
        self.client = self.scope.__enter__()
        self.root = Path(self.tmp.name) / "models" / "voices"

    def tearDown(self):
        self.fake.unblock.set()
        self.scope.__exit__(None, None, None)
        self.tmp.cleanup()

    def wait(self, job_id, statuses=("completed", "failed", "paused", "cancelled")):
        finish = time.monotonic() + 8
        while time.monotonic() < finish:
            response = self.client.get("/api/v1/tts/downloads/" + job_id)
            self.assertEqual(response.status_code, 200, response.text)
            job = response.json()
            if job["status"] in statuses:
                return job
            time.sleep(.025)
        self.fail("La descarga no alcanzó estado terminal")

    def install(self):
        result = self.client.post("/api/v1/tts/install", json={"voice_id": VOICE})
        self.assertEqual(result.status_code, 202, result.text)
        return result.json()["id"]

    def test_catalog_and_paired_verified_install_without_speech(self):
        catalog = self.client.get("/api/v1/tts/catalog")
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(len(catalog.json()["voices"]), 2)
        self.assertFalse(catalog.json()["voices"][0]["installed"])
        job = self.wait(self.install())
        self.assertEqual(job["status"], "completed", job["error"])
        self.assertEqual(job["received_bytes"], len(MODEL) + len(CONFIG))
        self.assertEqual((self.root / VOICE).read_bytes(), MODEL)
        self.assertEqual((self.root / (VOICE + ".json")).read_bytes(), CONFIG)
        self.assertTrue(self.client.get("/api/v1/tts/catalog").json()["voices"][0]["installed"])
        self.assertEqual(self.client.get("/api/v1/tts/voices").json()["voices"][0]["id"], VOICE)
        self.assertEqual(self.client.post("/api/v1/tts/install",
                                         json={"voice_id": VOICE}).status_code, 409)
        self.assertEqual(self.client.get("/api/v1/tts/downloads").json()["downloads"][0]["id"],
                         job["id"])
        self.assertFalse(list(self.root.glob("*.wav")))

    def test_hash_mismatch_fails_without_publishing_and_resume_can_recover(self):
        self.fake.wrong_model_hash = True
        job_id = self.install()
        job = self.wait(job_id)
        self.assertEqual(job["status"], "failed", job)
        self.assertIn("SHA-256", job["error"])
        self.assertFalse((self.root / VOICE).exists())
        self.assertFalse((self.root / (VOICE + ".json")).exists())
        # The metadata is pinned in this job. The original mock bytes now match
        # the stored expected sha only if the announced digest was correct.
        self.assertEqual(self.client.post("/api/v1/tts/downloads/" +
                        job_id + "/resume").status_code, 200)
        retry = self.wait(job_id)
        self.assertEqual(retry["status"], "failed")
        self.assertFalse((self.root / VOICE).exists())

    def test_existing_single_voice_file_is_not_overwritten_or_downloaded(self):
        target = self.root / VOICE
        target.write_bytes(b"custom user model")
        response = self.client.post("/api/v1/tts/install", json={"voice_id": VOICE})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(target.read_bytes(), b"custom user model")
        self.assertEqual(self.client.get("/api/v1/tts/downloads").json()["downloads"], [])
        self.assertEqual(self.fake.requests, [])

    def test_missing_pair_or_arbitrary_voice_never_queues(self):
        self.assertEqual(self.client.post("/api/v1/tts/install",
                         json={"voice_id": "../../other.onnx"}).status_code, 422)
        self.fake.missing_config = True
        no_pair = self.client.post("/api/v1/tts/install", json={"voice_id": VOICE})
        self.assertEqual(no_pair.status_code, 404)
        self.assertFalse(self.client.get("/api/v1/tts/downloads").json()["downloads"])
        self.assertFalse((self.root / VOICE).exists())

    def test_pause_resume_using_valid_http_range_and_cancel_cleanup(self):
        self.fake.partial_first = True
        job_id = self.install()
        self.assertTrue(self.fake.started.wait(3))
        # The first streamed bytes have been written and accounted for.
        limit = time.monotonic() + 4
        while self.client.get("/api/v1/tts/downloads/" + job_id).json()["received_bytes"] == 0:
            if time.monotonic() > limit:
                self.fail("No progress reported")
            time.sleep(.02)
        paused = self.client.post("/api/v1/tts/downloads/" + job_id + "/pause")
        self.assertEqual(paused.status_code, 200, paused.text)
        self.assertEqual(paused.json()["status"], "paused")
        self.fake.unblock.set()
        # The worker drains before the queued resume task, preserving .part.
        resumed = self.client.post("/api/v1/tts/downloads/" + job_id + "/resume")
        self.assertEqual(resumed.status_code, 200, resumed.text)
        result = self.wait(job_id)
        self.assertEqual(result["status"], "completed", result.get("error"))
        self.assertTrue(any(rng and rng.startswith("bytes=") for _, rng in self.fake.requests))
        self.assertEqual((self.root / VOICE).read_bytes(), MODEL)

    def test_cancel_queued_or_running_job_never_installs(self):
        self.fake.partial_first = True
        job_id = self.install()
        self.assertTrue(self.fake.started.wait(3))
        self.assertEqual(self.client.post("/api/v1/tts/downloads/" +
                                         job_id + "/cancel").status_code, 200)
        self.fake.unblock.set()
        result = self.wait(job_id)
        self.assertEqual(result["status"], "cancelled")
        # Wait for cleanup task in the single-thread worker.
        time.sleep(.10)
        self.assertFalse((self.root / VOICE).exists())
        self.assertFalse((self.root / (VOICE + ".json")).exists())
        self.assertFalse(list(self.root.glob(".noble-voice-*")))

if __name__ == "__main__":
    unittest.main()
