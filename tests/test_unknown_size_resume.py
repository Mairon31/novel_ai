"""Offline HTTP Range/416 tests when upstream does not advertise file size.

No live network, GPU, or Hugging Face data is accessed. Each test uses the
real DownloadManager and SQLite paths with explicit HTTP MockTransport.
"""
from __future__ import annotations

import gzip
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.catalog import HfCatalog
from noble_api.downloads import DownloadManager
from noble_api.store import Store

REPO = "noble-tests/unknown-size"
REV = "f" * 40
FILENAME = "tiny.Q4_K_M.gguf"
PAYLOAD = b"GGUF" + b"bytes-for-range-fixture" * 40
SHA = hashlib.sha256(PAYLOAD).hexdigest()


class UnknownSizeResumeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-unknown-size-")
        self.store = Store(Path(self.tmp.name) / "data")
        self.target = self.store.models_dir / "hf" / REPO / REV / FILENAME
        self.target.parent.mkdir(parents=True, exist_ok=True)
        self.part = Path(str(self.target) + ".part")
        self.job, _ = self.store.enqueue(REPO, REV, FILENAME, None, SHA)
        self.catalog = None
        self.manager = None
        self.requests = []

    def tearDown(self):
        if self.manager is not None:
            self.manager.shutdown()
        if self.catalog is not None:
            self.catalog.close()
        self.tmp.cleanup()

    def run_with(self, responder):
        def transport(request: httpx.Request):
            self.requests.append(request)
            return responder(request)
        self.catalog = HfCatalog(httpx.MockTransport(transport))
        self.manager = DownloadManager(self.store, self.catalog)
        self.manager._run(self.job["id"])
        return self.store.download(self.job["id"])

    def assert_failed_without_install(self, state, original):
        self.assertEqual(state["status"], "failed", state)
        self.assertEqual(self.store.installed(), [])
        self.assertFalse(self.target.exists())
        self.assertEqual(self.part.read_bytes(), original)

    def test_complete_unknown_size_part_accepts_precise_416_then_checks_sha(self):
        self.part.write_bytes(PAYLOAD)
        state = self.run_with(lambda req: httpx.Response(
            416, headers={"Content-Range": f"bytes */{len(PAYLOAD)}"}))
        self.assertEqual(state["status"], "completed", state)
        self.assertEqual(self.requests[0].headers["range"], f"bytes={len(PAYLOAD)}-")
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertFalse(self.part.exists())
        self.assertEqual(self.store.installed()[0]["sha256"], SHA)
        self.assertEqual(self.store.installed()[0]["integrity_status"], "sha256_verified")

    def test_416_wrong_total_cannot_register_or_modify_partial(self):
        self.part.write_bytes(PAYLOAD)
        state = self.run_with(lambda req: httpx.Response(
            416, headers={"Content-Range": f"bytes */{len(PAYLOAD) + 5}"}))
        self.assert_failed_without_install(state, PAYLOAD)
        self.assertIn("HTTP 416", state["error"])

    def test_416_without_content_range_cannot_claim_completeness(self):
        self.part.write_bytes(PAYLOAD)
        state = self.run_with(lambda req: httpx.Response(416))
        self.assert_failed_without_install(state, PAYLOAD)

    def test_corrupted_complete_part_is_still_rejected_by_sha(self):
        damaged = b"GGUF" + b"x" * (len(PAYLOAD) - 4)
        self.part.write_bytes(damaged)
        state = self.run_with(lambda req: httpx.Response(
            416, headers={"Content-Range": f"bytes */{len(damaged)}"}))
        self.assert_failed_without_install(state, damaged)
        self.assertIn("SHA-256", state["error"])

    def test_valid_tail_range_resumes_unknown_size_partial(self):
        self.part.write_bytes(PAYLOAD[:30])
        state = self.run_with(lambda req: httpx.Response(
            206, content=PAYLOAD[30:], headers={
                "Content-Range": f"bytes 30-{len(PAYLOAD) - 1}/{len(PAYLOAD)}"}))
        self.assertEqual(state["status"], "completed", state)
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertEqual(self.requests[0].headers["range"], "bytes=30-")
        self.assertEqual(self.store.installed()[0]["sha256"], SHA)

    def test_intermediate_206_cannot_be_installed_even_when_bytes_are_valid(self):
        self.part.write_bytes(PAYLOAD[:30])
        state = self.run_with(lambda req: httpx.Response(
            206, content=PAYLOAD[30:60], headers={
                "Content-Range": f"bytes 30-59/{len(PAYLOAD)}"}))
        self.assert_failed_without_install(state, PAYLOAD[:30])
        self.assertIn("rango", state["error"])

    def test_unknown_total_206_does_not_prove_full_transfer(self):
        self.part.write_bytes(PAYLOAD[:30])
        state = self.run_with(lambda req: httpx.Response(
            206, content=PAYLOAD[30:], headers={
                "Content-Range": f"bytes 30-{len(PAYLOAD) - 1}/*"}))
        self.assert_failed_without_install(state, PAYLOAD[:30])

    def test_server_ignoring_range_restarts_from_zero_without_duplication(self):
        self.part.write_bytes(PAYLOAD[:30])
        state = self.run_with(lambda req: httpx.Response(200, content=PAYLOAD))
        self.assertEqual(state["status"], "completed", state)
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertEqual(self.requests[0].headers["range"], "bytes=30-")

    def test_success_200_without_metadata_is_local_hash_only(self):
        # A server response can complete without LFS size or checksum.
        # That status must be distinct from provenance verification.
        with self.store._conn() as conn:
            conn.execute("UPDATE downloads SET expected_sha256=NULL WHERE id=?",
                         (self.job["id"],))
        state = self.run_with(lambda req: httpx.Response(200, content=PAYLOAD))
        self.assertEqual(state["status"], "completed", state)
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertEqual(self.store.installed()[0]["integrity_status"], "local_hash_only")

    def test_http_204_is_not_accepted_as_model_content(self):
        state = self.run_with(lambda req: httpx.Response(204))
        self.assertEqual(state["status"], "failed", state)
        self.assertEqual(self.store.installed(), [])
        self.assertFalse(self.target.exists())

    def test_html_from_server_cannot_be_registered_as_gguf_without_hash(self):
        with self.store._conn() as conn:
            conn.execute("UPDATE downloads SET expected_sha256=NULL WHERE id=?",
                         (self.job["id"],))
        html = b"<html><body>retry later</body></html>"
        state = self.run_with(lambda req: httpx.Response(200, content=html))
        self.assertEqual(state["status"], "failed", state)
        self.assertIn("GGUF", state["error"])
        self.assertEqual(self.store.installed(), [])
        self.assertEqual(self.part.read_bytes(), html)

    def test_server_declared_content_length_must_match_actual_body(self):
        short = PAYLOAD[:-10]
        state = self.run_with(lambda req: httpx.Response(
            200, content=short,
            headers={"Content-Length": str(len(PAYLOAD))}))
        self.assertEqual(state["status"], "failed", state)
        self.assertIn("incompleto", state["error"])
        self.assertEqual(self.part.read_bytes(), short)
        self.assertEqual(self.store.installed(), [])

    def test_compressed_model_response_is_rejected_without_modifying_partial(self):
        self.part.write_bytes(PAYLOAD[:30])
        state = self.run_with(lambda req: httpx.Response(
            200, content=gzip.compress(PAYLOAD),
            headers={"Content-Encoding": "gzip"}))
        self.assert_failed_without_install(state, PAYLOAD[:30])
        self.assertIn("comprimió", state["error"])
        self.assertEqual(self.requests[0].headers["accept-encoding"], "identity")

    def test_416_on_initial_request_without_partial_is_not_accepted(self):
        state = self.run_with(lambda req: httpx.Response(
            416, headers={"Content-Range": f"bytes */{len(PAYLOAD)}"}))
        self.assertEqual(state["status"], "failed")
        self.assertEqual(self.store.installed(), [])
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    unittest.main()
