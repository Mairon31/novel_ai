"""Approved gallery -> editorial cover: integrity, ownership and retry safety.

These checks use actual SQLite/files and fixture images, not ComfyUI/GPU.
"""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


def png() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (96, 64), (37, 59, 81)).save(output, "PNG")
    return output.getvalue()


class GalleryCoverPromotionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "The second lighthouse",
            "premise": "An archivist guards a village beside the ocean.",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.base = f"/api/v1/stories/{self.story}"
        self.approval_url = self.base + "/creator/cover/from-gallery"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def publish(self, story=None, origin="comfyui"):
        sid = story or self.story
        state = self.app.state.visual.publish(
            sid, png(), origin=origin,
            prompt="An abandoned lighthouse at sunset",
            checkpoint="test-checkpoint.safetensors" if origin == "comfyui" else None,
            seed=17 if origin == "comfyui" else None)
        return state["selected_asset_id"]

    def approve(self, image_id, label="Reviewed Lighthouse",
                caption="A twilight lighthouse overlooking the sea."):
        return self.client.post(self.approval_url, json={
            "gallery_asset_id": image_id, "label": label, "caption": caption,
        })

    def test_approval_creates_separate_cover_and_reuses_existing_approval(self):
        gallery = self.publish()
        original = self.app.state.visual.reference_bytes(self.story, gallery)[0]
        result = self.approve(gallery)
        self.assertEqual(result.status_code, 201, result.text)
        approved = result.json()
        self.assertFalse(approved["reused"])
        self.assertEqual(approved["asset"]["kind"], "cover")
        self.assertEqual(approved["asset"]["source"], "ai_reviewed")
        self.assertEqual(approved["story"]["cover_asset_id"], approved["asset"]["id"])
        with Image.open(io.BytesIO(self.client.get(approved["asset"]["url"]).content)) as cover:
            self.assertEqual(cover.format, "WEBP")
        self.assertEqual(self.app.state.visual.reference_bytes(self.story, gallery)[0], original)
        with self.app.state.narrative.store._conn() as db:
            meta = db.execute("SELECT generation_json FROM creator_media_assets "
                              "WHERE id=?", (approved["asset"]["id"],)).fetchone()
        info = json.loads(meta["generation_json"])
        self.assertEqual(info["source_gallery_asset_id"], gallery)
        self.assertEqual(info["checkpoint"], "test-checkpoint.safetensors")

        repeat = self.approve(gallery, label="Another title")
        self.assertEqual(repeat.status_code, 201, repeat.text)
        self.assertTrue(repeat.json()["reused"])
        self.assertEqual(repeat.json()["asset"]["id"], approved["asset"]["id"])
        self.assertEqual(len(self.client.get(self.base + "/creator/assets").json()["assets"]), 1)
        self.assertEqual(len(self.client.get(self.base + "/visual-state").json()["assets"]), 1)

        # Restart must retain the approval link; no second copy is created.
        with TestClient(create_app(self.root)) as restarted:
            again = restarted.post(self.approval_url, json={
                "gallery_asset_id": gallery, "label": "Third title",
                "caption": "An approved book cover.",
            })
            self.assertEqual(again.status_code, 201, again.text)
            self.assertTrue(again.json()["reused"])
            self.assertEqual(again.json()["asset"]["id"], approved["asset"]["id"])

    def test_deleting_approved_cover_allows_fresh_approval_and_keeps_source(self):
        source = self.publish(origin="manual")
        first = self.approve(source).json()
        self.assertEqual(first["asset"]["source"], "manual")
        self.assertEqual(self.client.delete(
            self.base + "/creator/assets/" + first["asset"]["id"]).status_code, 204)
        self.assertIsNone(self.client.get(self.base).json()["cover_asset_id"])
        second = self.approve(source)
        self.assertEqual(second.status_code, 201, second.text)
        self.assertFalse(second.json()["reused"])
        self.assertNotEqual(second.json()["asset"]["id"], first["asset"]["id"])
        self.assertEqual(len(self.client.get(self.base + "/visual-state").json()["assets"]), 1)

    def test_other_story_or_missing_image_cannot_be_approved(self):
        other = self.client.post("/api/v1/stories", json={
            "title": "Outside kingdom",
            "premise": "A completely different realm across the mountains.",
        }).json()["id"]
        foreign = self.publish(other)
        for source in (foreign, str(uuid.uuid4())):
            with self.subTest(source=source):
                response = self.approve(source)
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.get(self.base + "/creator/assets").json()["assets"], [])
        self.assertIsNone(self.client.get(self.base).json()["cover_asset_id"])

    def test_sha_corruption_and_invalid_metadata_reject_without_artifact(self):
        asset = self.publish()
        path = self.app.state.visual._asset_path(self.story, asset)
        path.write_bytes(b"tampered source bytes")
        self.assertEqual(self.approve(asset).status_code, 422)
        self.assertEqual(self.client.get(self.base + "/creator/assets").json()["assets"], [])
        self.assertIsNone(self.client.get(self.base).json()["cover_asset_id"])
        self.assertEqual(self.approve(asset, label=" ", caption="too short").status_code, 422)
        self.assertEqual(self.approve(asset, label="Valid", caption="x").status_code, 422)

    def test_selected_cover_satisfies_preflight_without_rendering(self):
        self.client.put(self.base + "/creator", json={"visual_start": "cover_background"})
        source = self.publish()
        before = self.client.get(self.base + "/visual-preflight").json()
        self.assertEqual([x["kind"] for x in before["missing"]], ["cover"])
        self.assertTrue(self.approve(source).json()["asset"]["id"])
        after = self.client.get(self.base + "/visual-preflight").json()
        self.assertEqual(after["missing"], [])
        self.assertTrue(after["ready"])


if __name__ == "__main__":
    unittest.main()
