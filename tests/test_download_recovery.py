"""Offline crash-recovery regression tests for a renamed, uncommitted GGUF."""
from __future__ import annotations

import hashlib
import sys
import tempfile
import time
import unittest
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.catalog import HfCatalog
from noble_api.downloads import DownloadManager
from noble_api.store import Store

REPO = "crash-test/tiny-gguf"
REV = "c" * 40
FILENAME = "tiny.Q4_K_M.gguf"
PAYLOAD = b"GGUF" + b"recovery-fixture" * 100
SHA = hashlib.sha256(PAYLOAD).hexdigest()


def no_network(request: httpx.Request):
    if "/resolve/" in request.url.path:
        raise AssertionError("A complete recovered file must not be downloaded again")
    return httpx.Response(404)


class CrashRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-crash-recovery-")
        self.root = Path(self.tmp.name) / "data"
        self.store = Store(self.root)
        self.job, _ = self.store.enqueue(REPO, REV, FILENAME, len(PAYLOAD), SHA)
        self.assertTrue(self.store.transition_download(
            self.job["id"], ("queued",), "verifying"))
        self.target = self.store.models_dir / "hf" / REPO / REV / FILENAME
        self.target.parent.mkdir(parents=True, exist_ok=True)
        self.part = Path(str(self.target) + ".part")
        self.manager = None
        self.catalog = None

    def tearDown(self):
        if self.manager is not None:
            self.manager.shutdown()
        if self.catalog is not None:
            self.catalog.close()
        self.tmp.cleanup()

    def restart(self):
        self.catalog = HfCatalog(httpx.MockTransport(no_network))
        self.manager = DownloadManager(Store(self.root), self.catalog)
        return self.manager

    def await_terminal(self):
        for _ in range(120):
            state = self.manager.store.download(self.job["id"])
            if state["status"] in ("completed", "failed"):
                return state
            time.sleep(.02)
        self.fail("Model job did not reach a terminal status")

    def test_restarts_from_renamed_file_without_network_or_data_loss(self):
        self.target.write_bytes(PAYLOAD)  # Crash after os.replace but before DB commit.
        manager = self.restart()
        self.assertEqual(manager.recovery_report["recovered"], 1)
        self.assertFalse(self.target.exists())
        self.assertEqual(self.part.read_bytes(), PAYLOAD)
        self.assertEqual(manager.store.installed(), [])
        self.assertEqual(manager.store.download(self.job["id"])["status"], "paused")
        self.assertEqual(manager.reconcile_interrupted()["recovered"], 0)
        manager.control(self.job["id"], "resume")
        self.assertEqual(self.await_terminal()["status"], "completed")
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertEqual(manager.store.installed()[0]["sha256"], SHA)
        self.assertEqual(manager.store.installed()[0]["integrity_status"], "sha256_verified")

    def test_both_final_and_part_exist_keeps_both_untouched(self):
        self.target.write_bytes(PAYLOAD)
        self.part.write_bytes(PAYLOAD[:30])
        manager = self.restart()
        self.assertEqual(manager.recovery_report["conflicts"], 1)
        self.assertEqual(manager.store.download(self.job["id"])["status"], "failed")
        self.assertEqual(self.target.read_bytes(), PAYLOAD)
        self.assertEqual(self.part.read_bytes(), PAYLOAD[:30])
        self.assertEqual(manager.store.installed(), [])

    def test_symlink_to_external_file_is_not_recovered_or_read(self):
        outside = Path(self.tmp.name) / "unrelated-weights.gguf"
        outside.write_bytes(b"confidential-non-model")
        try:
            self.target.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("File symlinks unavailable")
        manager = self.restart()
        self.assertEqual(manager.recovery_report["conflicts"], 1)
        self.assertEqual(manager.store.download(self.job["id"])["status"], "failed")
        self.assertTrue(self.target.is_symlink())
        self.assertEqual(outside.read_bytes(), b"confidential-non-model")
        self.assertFalse(self.part.exists())

    def test_corrupt_renamed_file_must_fail_sha_on_resume(self):
        corrupt = b"GGUF" + b"X" * (len(PAYLOAD) - 4)
        self.target.write_bytes(corrupt)
        manager = self.restart()
        self.assertEqual(manager.recovery_report["recovered"], 1)
        manager.control(self.job["id"], "resume")
        state = self.await_terminal()
        self.assertEqual(state["status"], "failed", state)
        self.assertIn("SHA-256", state["error"])
        self.assertEqual(manager.store.installed(), [])
        self.assertFalse(self.target.exists())
        self.assertEqual(self.part.read_bytes(), corrupt)


if __name__ == "__main__":
    unittest.main()
