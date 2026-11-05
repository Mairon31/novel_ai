"""Verify model-storage accounting and path isolation without a GPU or network."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.main import create_app


class ModelStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name) / "data")
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        self.store = self.app.state.store

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def _register(self, name: str, file: Path):
        file.parent.mkdir(parents=True, exist_ok=True)
        job = {
            "repo_id": "test/model", "revision": "a" * 40,
            "filename": name,
        }
        return self.store.register_model(job, file, "f" * 64, "sha256_verified")

    def test_disk_uses_actual_model_files_and_partial_downloads(self):
        full = self.store.models_dir / "hf" / "test" / "model" / ("a" * 40) / "model.gguf"
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(b"model" * 10)
        mid = self._register("model.gguf", full)

        part = self.store.models_dir / "hf" / "test" / "other" / ("b" * 40) / "work.gguf.part"
        part.parent.mkdir(parents=True, exist_ok=True)
        part.write_bytes(b"half-downloaded")
        self.store.enqueue("test/other", "b" * 40, "work.gguf", 5000, None)

        response = self.client.get("/api/v1/models/storage")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["installed"]["count"], 1)
        self.assertEqual(body["installed"]["bytes"], 50)
        self.assertEqual(body["partial"]["bytes"], len(b"half-downloaded"))
        self.assertEqual(body["partial"]["count"], 1)
        self.assertEqual(body["scope"], "registered_and_partial_files_only")
        self.assertEqual(body["models_dir"], str(self.store.models_dir))
        self.assertGreater(body["disk"]["total_bytes"], body["disk"]["free_bytes"])
        self.assertEqual(body["items"][0]["id"], mid)
        self.assertTrue(body["items"][0]["file_present"])

        # The same registered row reflects a missing actual file without claiming
        # that its bytes still occupy the models folder.
        full.unlink()
        again = self.client.get("/api/v1/models/storage").json()
        self.assertEqual(again["installed"]["count"], 1)
        self.assertEqual(again["installed"]["bytes"], 0)
        self.assertFalse(next(item for item in again["items"] if item["id"] == mid)
                         ["file_present"])

    def test_registered_external_or_symlink_path_is_not_counted(self):
        outside = Path(self.tmp.name) / "private.gguf"
        outside.write_bytes(b"not-owned" * 400)
        self._register("outside.gguf", outside)
        linked = self.store.models_dir / "linked.gguf"
        try:
            linked.symlink_to(outside)
        except (OSError, NotImplementedError):
            pass
        else:
            self._register("linked.gguf", linked)
        result = self.client.get("/api/v1/models/storage").json()
        self.assertEqual(result["installed"]["bytes"], 0)
        self.assertTrue(all(not item["file_present"] for item in result["items"]))
        self.assertEqual(result["partial"]["count"], 0)
        self.assertEqual(result["disk"]["used_bytes"] + result["disk"]["free_bytes"],
                         result["disk"]["total_bytes"])


if __name__ == "__main__":
    unittest.main()
