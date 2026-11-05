"""Round-trip portable branch family backups and adversarial archive validation."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app
from noble_api.story_archive import TABLES


def picture(color):
    image = Image.new("RGB", (48, 48), color)
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def repack(original: bytes, change):
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as old:
        entries = [(name, old.read(name)) for name in old.namelist()]
    updated = change(entries)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as next_archive:
        for name, data in updated:
            next_archive.writestr(name, data)
    return output.getvalue()


class StoryArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-archive-")
        self.src = create_app(Path(self.temp.name) / "source")
        self.dest = create_app(Path(self.temp.name) / "destination")
        self.a_handle = TestClient(self.src)
        self.b_handle = TestClient(self.dest)
        self.a = self.a_handle.__enter__()
        self.b = self.b_handle.__enter__()
        response = self.a.post("/api/v1/stories", json={
            "title": "La ciudad del espejo",
            "premise": "Un viajero visita el faro para encontrar el mapa de un reino.",
            "protagonist_name": "Ariel",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.root_id = response.json()["id"]
        self.child_id = None

    def tearDown(self):
        self.b_handle.__exit__(None, None, None)
        self.a_handle.__exit__(None, None, None)
        self.temp.cleanup()

    def turn(self, story: str, text: str):
        return self.src.state.narrative.append(
            story, str(uuid.uuid4()), "do", text, "La historia avanza.", "mock")

    def setup_family(self, art=True):
        client, story = self.a, self.root_id
        change = client.put(
            f"/api/v1/stories/{story}/creator", json={
                "synopsis": "La ciudad escondida y el mapa perdido",
                "ai_plot": "SECRETO PRIVADO DE LA TRAMA",
            })
        self.assertEqual(change.status_code, 200, change.text)
        if art:
            cover = client.post(f"/api/v1/stories/{story}/creator/assets",
                                data={"kind": "cover", "label": "Portada",
                                      "caption": "El mapa antiguo"},
                                files={"file": ("cover.png", picture((80, 10, 170)), "image/png")})
            self.assertEqual(cover.status_code, 201, cover.text)
            client.put(f"/api/v1/stories/{story}/creator/cover",
                       json={"asset_id": cover.json()["id"]})
            illustration = client.post(
                f"/api/v1/stories/{story}/scene-image",
                files={"file": ("temple.png", picture((25, 140, 20)), "image/png")})
            self.assertEqual(illustration.status_code, 200, illustration.text)
        first = self.turn(story, "Recogí el medallón de cuarzo")
        self.turn(story, "Encuentro el secreto del reino futuro")
        branch = client.post(f"/api/v1/stories/{story}/fork",
                             json={"until_turn_id": first["id"]})
        self.assertEqual(branch.status_code, 201, branch.text)
        self.child_id = branch.json()["id"]
        self.turn(self.child_id, "Camino hacia la torre de ónice")
        return first

    def export(self, story=None):
        result = self.a.get(f"/api/v1/stories/{story or self.root_id}/archive.noble.zip")
        self.assertEqual(result.status_code, 200, result.text[:250] if result.status_code != 200 else "")
        self.assertIn("attachment", result.headers["content-disposition"])
        return result.content

    def restore(self, data, client=None):
        return (client or self.b).post(
            "/api/v1/stories/archive/import",
            files={"file": ("my-family.noble.zip", data, "application/zip")})

    def counts(self, app):
        with app.state.store._conn() as db:
            return {table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                    for table in TABLES}

    def test_roundtrip_includes_full_graph_metadata_and_assets(self):
        self.setup_family()
        original = self.counts(self.src)
        data = self.export(self.child_id)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertEqual(archive.namelist()[0], "manifest.json")
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["version"], 1)
            self.assertEqual(manifest["root_story_id"], self.root_id)
            self.assertEqual(len(manifest["tables"]["stories"]), 2)
            self.assertGreater(len(manifest["files"]), 1)
            self.assertNotIn("narrative_turn_fts", manifest["tables"])
        result = self.restore(data)
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(result.json()["restored_stories"], 2)
        self.assertEqual(set(result.json()["story_ids"]), {self.root_id, self.child_id})
        self.assertEqual(self.counts(self.dest), original)
        branch = self.b.get(f"/api/v1/stories/{self.child_id}").json()
        self.assertEqual(branch["origin_story_id"], self.root_id)
        self.assertIsNotNone(branch["origin_turn_id"])
        self.assertEqual(branch["protagonist_name"], "Ariel")
        story = self.b.get(f"/api/v1/stories/{self.root_id}").json()
        self.assertIsNotNone(story["cover_image_url"])
        self.assertIsNotNone(story["scene_image_url"])
        self.assertEqual(self.b.get(story["cover_image_url"]).status_code, 200)
        self.assertEqual(self.b.get(story["scene_image_url"]).status_code, 200)
        self.assertEqual(len(self.b.get(
            f"/api/v1/stories/{self.child_id}/turns").json()["turns"]), 2)
        self.assertEqual(self.b.get(
            f"/api/v1/stories/{self.child_id}/memory/search",
            params={"q": "medallón cuarzo"}).json()["episodes"][0]["story_id"],
            self.child_id)
        self.assertEqual(self.b.get(
            f"/api/v1/stories/{self.child_id}/memory/search",
            params={"q": "reino futuro"}).json()["episodes"], [])
        self.assertEqual(self.b.get(
            f"/api/v1/stories/{self.root_id}/creator").json()["ai_plot"],
            "SECRETO PRIVADO DE LA TRAMA")

    def test_conflict_is_409_without_overwriting_current_data(self):
        self.setup_family(art=False)
        data = self.export()
        before = self.counts(self.src)
        existing = self.restore(data, self.a)
        self.assertEqual(existing.status_code, 409, existing.text)
        self.assertEqual(self.counts(self.src), before)
        first = self.restore(data)
        self.assertEqual(first.status_code, 201, first.text)
        prior = self.counts(self.dest)
        again = self.restore(data)
        self.assertEqual(again.status_code, 409, again.text)
        self.assertEqual(self.counts(self.dest), prior)

    def test_bad_hash_and_zip_traversal_are_rejected_before_any_writes(self):
        self.setup_family()
        original = self.export()
        def damage(entries):
            return [(name, b"corrupted" if name.startswith("story-assets/") else raw)
                    for name, raw in entries]
        bad = self.restore(repack(original, damage))
        self.assertEqual(bad.status_code, 422, bad.text)
        self.assertEqual(self.counts(self.dest)["stories"], 0)

        def traverse(entries):
            manifest = json.loads(entries[0][1])
            manifest["files"][0]["path"] = "../../injected.txt"
            entries[0] = ("manifest.json", json.dumps(manifest).encode())
            entries[1] = ("../../injected.txt", entries[1][1])
            return entries
        invalid = self.restore(repack(original, traverse))
        self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertFalse((Path(self.temp.name) / "injected.txt").exists())
        self.assertEqual(self.counts(self.dest)["stories"], 0)

    def test_database_row_outside_family_is_rejected(self):
        self.setup_family(art=False)
        data = self.export()
        def forge(entries):
            manifest = json.loads(entries[0][1])
            manifest["tables"]["story_turns"][0]["story_id"] = str(uuid.uuid4())
            entries[0] = ("manifest.json", json.dumps(manifest).encode())
            return entries
        reply = self.restore(repack(data, forge))
        self.assertEqual(reply.status_code, 422, reply.text)
        self.assertEqual(self.counts(self.dest)["stories"], 0)

    def test_failed_index_write_rolls_back_stories_and_cleans_media(self):
        self.setup_family()
        data = self.export()
        with patch.object(self.dest.state.episodes, "index_turn_in_transaction",
                          side_effect=RuntimeError("simulated index failure")):
            with self.assertRaisesRegex(RuntimeError, "simulated index failure"):
                from noble_api.story_archive import restore_archive
                restore_archive(self.dest.state.narrative, data)
        self.assertEqual(self.counts(self.dest)["stories"], 0)
        for sid in (self.root_id, self.child_id):
            self.assertFalse((self.dest.state.store.root / "story-assets" / sid).exists())
            self.assertFalse((self.dest.state.store.root / "fork-staging" /
                              (sid + ".pending")).exists())
        result = self.restore(data)
        self.assertEqual(result.status_code, 201, result.text)

    def test_unknown_story_missing_zip_and_invalid_extension(self):
        self.assertEqual(self.a.get(f"/api/v1/stories/{uuid.uuid4()}/archive.noble.zip").status_code, 404)
        missing = self.restore(b"not a zip")
        self.assertEqual(missing.status_code, 422)
        filename = self.b.post("/api/v1/stories/archive/import",
                               files={"file": ("malicious.txt", b"fake", "text/plain")})
        self.assertEqual(filename.status_code, 422)


if __name__ == "__main__":
    unittest.main()
