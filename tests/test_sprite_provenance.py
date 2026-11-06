"""Approved sprite provenance follows permanent Creator assets, forks and v1 backups."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.main import create_app
from noble_api.creator_media import EXPRESSIONS


def sheet():
    image = Image.new("RGBA", (256 * 5, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for i in range(5):
        x = i * 256
        draw.ellipse((x + 70, 24, x + 184, 229), fill=(145, 75, 200, 255))
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


def rewrite(payload, modifier):
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(payload)) as source:
        entries = [(key, source.read(key)) for key in source.namelist()]
    manifest = json.loads(entries[0][1])
    modifier(manifest)
    entries[0] = ("manifest.json", json.dumps(manifest).encode())
    with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as target:
        for name, data in entries:
            target.writestr(name, data)
    return result.getvalue()


class SpriteProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.source = create_app(Path(self.temp.name) / "source")
        self.dest = create_app(Path(self.temp.name) / "dest")
        self.src_ctx = TestClient(self.source)
        self.dst_ctx = TestClient(self.dest)
        self.a, self.b = self.src_ctx.__enter__(), self.dst_ctx.__enter__()
        created = self.a.post("/api/v1/stories", json={
            "title": "El bosque de Aira",
            "premise": "Aira descubre nuevas habitaciones bajo el bosque.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        npc = self.a.post(f"/api/v1/stories/{self.story}/creator/characters", json={
            "name": "Aira", "description": "Aira es la guardiana del bosque encantado."})
        self.assertEqual(npc.status_code, 201, npc.text)
        self.npc = npc.json()["id"]
        self.details = {
            "workflow_version": "comfy-sprite-v1",
            "checkpoint": "novel.safetensors",
            "seed": 712,
            "prompt_sha256": "a" * 64,
            "lora": {"character_name": "Aira", "lora_name": "aira.safetensors",
                     "strength": 0.78},
            "quality": {"method": "border_chroma_key", "coverage": 0.3,
                        "requires_author_review": True, "author_approved": True},
        }

    def tearDown(self):
        self.dst_ctx.__exit__(None, None, None)
        self.src_ctx.__exit__(None, None, None)
        self.temp.cleanup()

    def populate(self):
        return self.source.state.creator_media.import_expression_sheet(
            self.story, self.npc, sheet(), "Aira en el bosque", "standing",
            generation={name: self.details for name in EXPRESSIONS})

    def backup(self):
        url = f"/api/v1/stories/{self.story}/archive.noble.zip"
        response = self.a.get(url)
        self.assertEqual(response.status_code, 200, response.text
                         if response.status_code != 200 else "")
        return response.content

    def restore(self, content, as_copy=False, client=None):
        return (client or self.b).post("/api/v1/stories/archive/import",
            params={"as_copy": str(as_copy).lower()},
            files={"file": ("sprites.noble.zip", content, "application/zip")})

    def test_approved_origin_and_metadata_survive_fork_and_archive(self):
        generated = self.populate()
        self.assertEqual(len(generated), 5)
        self.assertEqual({item["source"] for item in generated}, {"ai_reviewed"})
        self.assertEqual(generated[0]["generation_details"], self.details)
        branched = self.a.post(f"/api/v1/stories/{self.story}/fork", json={})
        self.assertEqual(branched.status_code, 201, branched.text)
        new_story = branched.json()["id"]
        copied = self.a.get(
            f"/api/v1/stories/{new_story}/creator/assets").json()["assets"]
        self.assertEqual(len(copied), 5)
        self.assertEqual({item["source"] for item in copied}, {"ai_reviewed"})
        self.assertTrue(all(item["generation_details"] == self.details
                            for item in copied))
        self.assertTrue({item["id"] for item in copied}.isdisjoint(
            {item["id"] for item in generated}))
        archive = self.backup()
        restored = self.restore(archive)
        self.assertEqual(restored.status_code, 201, restored.text)
        assets = self.b.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertEqual(len(assets), 5)
        self.assertTrue(all(item["source"] == "ai_reviewed" for item in assets))
        self.assertEqual(assets[0]["generation_details"], self.details)
        duplicate = self.restore(archive, as_copy=True, client=self.a)
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        duplicate_id = duplicate.json()["root_story_id"]
        copy_assets = self.a.get(
            f"/api/v1/stories/{duplicate_id}/creator/assets").json()["assets"]
        self.assertEqual(len(copy_assets), 5)
        self.assertTrue(all(a["generation_details"] == self.details
                            for a in copy_assets))

    def test_legacy_v1_archive_defaults_missing_origin_and_generation(self):
        self.populate()
        historical = rewrite(self.backup(), lambda manifest: [
            (row.pop("source"), row.pop("generation_json"))
            for row in manifest["tables"]["creator_media_assets"]])
        restored = self.restore(historical)
        self.assertEqual(restored.status_code, 201, restored.text)
        assets = self.b.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertEqual({item["source"] for item in assets}, {"manual"})
        self.assertTrue(all(item["generation_details"] == {} for item in assets))

    def test_forbidden_metadata_and_mismatch_are_rejected_atomically(self):
        self.populate()
        packed = self.backup()
        for invalid in (
            {"generation_json": json.dumps({**self.details,
                "lora": {"character_name": "Aira",
                         "lora_name": "../escape.safetensors", "strength": 0.8}})},
            {"generation_json": json.dumps({**self.details,
                "quality": {**self.details["quality"], "author_approved": False}})},
            {"source": "manual"},
            {"generation_json": 'invalid-json'},
        ):
            forged = rewrite(packed, lambda manifest: [
                row.update(invalid) for row in
                manifest["tables"]["creator_media_assets"]])
            denied = self.restore(forged)
            self.assertEqual(denied.status_code, 422, (invalid, denied.text))
        with self.dest.state.store._conn() as db:
            count = db.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
        self.assertEqual(count, 0)

    def test_ipadapter_provenance_survives_backup_and_rejects_invalid_weight(self):
        from noble_api.sprite_provenance import normalize_sprite_generation
        adapter = {"preset": "PLUS FACE (portraits)", "weight": 0.68,
                   "reference_sha256": "b" * 64, "reference_kind": "sprite"}
        detail = {**self.details, "workflow_version": "comfy-sprite-v2-ipadapter",
                  "adapter": adapter}
        expected = normalize_sprite_generation(detail)
        self.assertEqual(expected["adapter"], adapter)
        self.source.state.creator_media.import_expression_sheet(
            self.story, self.npc, sheet(), "Aira en el bosque",
            generation={item: detail for item in EXPRESSIONS})
        restored = self.restore(self.backup())
        self.assertEqual(restored.status_code, 201, restored.text)
        assets = self.b.get(f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertTrue(all(x["generation_details"]["adapter"] == adapter for x in assets))
        forged = rewrite(self.backup(), lambda manifest: [
            row.__setitem__("generation_json", json.dumps({
                **detail, "adapter": {**adapter, "weight": 9.0}}))
            for row in manifest["tables"]["creator_media_assets"]])
        denied = self.restore(forged, as_copy=True, client=self.a)
        self.assertEqual(denied.status_code, 422, denied.text)

    def test_neural_matte_model_provenance_survives_archive_and_rejects_tamper(self):
        from noble_api.sprite_provenance import normalize_sprite_generation
        neural = {
            **self.details,
            "workflow_version": "comfy-sprite-v3-matting",
            "quality": {**self.details["quality"], "method": "neural_birefnet"},
            "matting": {"mode": "neural_birefnet_portrait",
                        "model": "BiRefNet-portrait"},
        }
        self.assertEqual(normalize_sprite_generation(neural), neural)
        self.source.state.creator_media.import_expression_sheet(
            self.story, self.npc, sheet(), "Aira en bosque", generation={
                name: neural for name in EXPRESSIONS})
        backed = self.backup()
        result = self.restore(backed)
        self.assertEqual(result.status_code, 201, result.text)
        assets = self.b.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertEqual(assets[0]["generation_details"]["matting"],
                         neural["matting"])
        for modified in (
            {**neural, "matting": {"mode": "neural_birefnet_portrait",
                                  "model": "RMBG-2.0"}},
            {**neural, "quality": {**neural["quality"],
                                  "method": "border_chroma_key"}},
            {**neural, "matting": {"mode": "../unsafe", "model": "RMBG-2.0"}},
            {**neural, "workflow_version": "comfy-sprite-v1"},
        ):
            with self.assertRaises(ValueError):
                normalize_sprite_generation(modified)
            forged = rewrite(backed, lambda manifest: [
                row.__setitem__("generation_json", json.dumps(modified))
                for row in manifest["tables"]["creator_media_assets"]])
            denied = self.restore(forged, as_copy=True, client=self.a)
            self.assertEqual(denied.status_code, 422, denied.text)

    def test_neural_ipadapter_v4_keeps_both_reference_and_model(self):
        from noble_api.sprite_provenance import normalize_sprite_generation
        v4 = {**self.details,
              "workflow_version": "comfy-sprite-v4-matting-ipadapter",
              "quality": {**self.details["quality"], "method": "neural_rmbg"},
              "matting": {"mode": "neural_rmbg2", "model": "RMBG-2.0"},
              "adapter": {
                  "preset": "PLUS FACE (portraits)",
                  "weight": 0.7, "reference_sha256": "a" * 64,
                  "reference_kind": "sprite"}}
        self.assertEqual(normalize_sprite_generation(v4), v4)
        self.source.state.creator_media.import_expression_sheet(
            self.story, self.npc, sheet(), "Aira en bosque", generation={
                name: v4 for name in EXPRESSIONS})
        restored = self.restore(self.backup())
        self.assertEqual(restored.status_code, 201, restored.text)
        files = self.b.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertTrue(all(
            row["generation_details"]["workflow_version"]
            == "comfy-sprite-v4-matting-ipadapter" for row in files))

    def test_regular_manual_assets_remain_manual_with_empty_generation(self):
        asset = self.source.state.creator_media.add(
            self.story, "foreground", "Aira", "Aira recorre el bosque",
            single(), character_id=self.npc)
        self.assertEqual(asset["source"], "manual")
        self.assertEqual(asset["generation_details"], {})


def single():
    img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((70, 20, 190, 230), fill=(220, 90, 130, 255))
    stream = io.BytesIO()
    img.save(stream, "PNG")
    return stream.getvalue()


if __name__ == "__main__":
    unittest.main()
