"""Versioned ComfyUI LoRA provenance survives forks and portable archives."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


def png() -> bytes:
    stream = io.BytesIO()
    Image.new("RGB", (64, 64), (34, 80, 130)).save(stream, "PNG")
    return stream.getvalue()


def change_archive(original: bytes, modifier) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as source:
        entries = [(name, source.read(name)) for name in source.namelist()]
    manifest = json.loads(entries[0][1])
    modifier(manifest)
    entries[0] = ("manifest.json", json.dumps(manifest).encode())
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for filename, data in entries:
            target.writestr(filename, data)
    return output.getvalue()


class VisualRenderProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name) / "source")
        self.other = create_app(Path(self.tmp.name) / "other")
        self.a_cm, self.b_cm = TestClient(self.app), TestClient(self.other)
        self.a, self.b = self.a_cm.__enter__(), self.b_cm.__enter__()
        created = self.a.post("/api/v1/stories", json={
            "title": "LoRA en galería",
            "premise": "Aira observa las estrellas del castillo encantado.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.base = f"/api/v1/stories/{self.story}"
        self.details = {
            "workflow_version": "comfy-native-v3-lora",
            "loras": [{"character_name": "Aira", "lora_name": "aira.safetensors",
                       "strength": 0.72}],
        }

    def tearDown(self):
        self.b_cm.__exit__(None, None, None)
        self.a_cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def publish(self):
        return self.app.state.visual.publish(
            self.story, png(), "comfyui", prompt="Aira junto al lago",
            checkpoint="noble.safetensors", seed=42,
            render_signature="sha-demo", render_details=self.details)

    def download(self):
        response = self.a.get(self.base + "/archive.noble.zip")
        self.assertEqual(response.status_code, 200, response.text[:500]
                         if response.status_code != 200 else "")
        return response.content

    def restore(self, content, client=None, as_copy=False):
        return (client or self.b).post("/api/v1/stories/archive/import",
            params={"as_copy": str(as_copy).lower()},
            files={"file": ("history.noble.zip", content, "application/zip")})

    def test_manual_versions_and_fork_keep_owned_lora_provenance(self):
        self.publish()
        manual = self.app.state.visual.publish(self.story, png(), "manual")
        assets = manual["assets"]
        self.assertEqual(len(assets), 2)
        self.assertEqual(assets[0]["render_details"], {})
        generated = next(a for a in assets if a["origin"] == "comfyui")
        self.assertEqual(generated["render_details"], self.details)
        fork = self.a.post(self.base + "/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        branch = fork.json()["id"]
        copied = self.a.get(f"/api/v1/stories/{branch}/visual-state")
        self.assertEqual(copied.status_code, 200, copied.text)
        prior = next(item for item in copied.json()["assets"]
                     if item["origin"] == "comfyui")
        self.assertEqual(prior["render_details"], self.details)
        self.assertNotEqual(prior["id"], generated["id"])

    def test_v1_archive_preserves_provenance_in_normal_and_copy_import(self):
        self.publish()
        packed = self.download()
        with zipfile.ZipFile(io.BytesIO(packed)) as archive:
            rows = json.loads(archive.read("manifest.json"))["tables"]["visual_assets"]
            self.assertEqual(rows[0]["render_details_json"],
                             json.dumps(self.details, ensure_ascii=False,
                                        sort_keys=True))
        restored = self.restore(packed)
        self.assertEqual(restored.status_code, 201, restored.text)
        entries = self.b.get(self.base + "/visual-state").json()["assets"]
        self.assertEqual(entries[0]["render_details"], self.details)
        copied = self.restore(packed, self.a, as_copy=True)
        self.assertEqual(copied.status_code, 201, copied.text)
        foreign = self.a.get("/api/v1/stories/" +
                             copied.json()["root_story_id"] + "/visual-state")
        self.assertEqual(foreign.status_code, 200, foreign.text)
        self.assertEqual(foreign.json()["assets"][0]["render_details"], self.details)

    def test_pre_provenance_archive_uses_safe_empty_default(self):
        self.publish()
        old = change_archive(self.download(), lambda manifest: [
            row.pop("render_details_json") for row in
            manifest["tables"]["visual_assets"]])
        restored = self.restore(old)
        self.assertEqual(restored.status_code, 201, restored.text)
        entries = self.b.get(self.base + "/visual-state").json()["assets"]
        self.assertEqual(entries[0]["render_details"], {})
        with self.other.state.store._conn() as db:
            row = db.execute("SELECT render_details_json FROM visual_assets WHERE story_id=?",
                             (self.story,)).fetchone()
        self.assertEqual(row["render_details_json"], "{}")

    def test_tampered_provenance_json_rejected_without_writes(self):
        self.publish()
        forged = change_archive(self.download(), lambda manifest: [
            row.__setitem__("render_details_json", "[not-json")
            for row in manifest["tables"]["visual_assets"]])
        denied = self.restore(forged)
        self.assertEqual(denied.status_code, 422, denied.text)
        with self.other.state.store._conn() as db:
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM stories").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
