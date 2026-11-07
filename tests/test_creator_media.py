"""Creator media: private background/transparent sprite storage and conservative scene selection."""
from __future__ import annotations

import io
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app
from noble_api.creator_media import _score


def image_bytes(mode: str = "RGBA") -> bytes:
    im = Image.new(mode, (96, 64), (160, 32, 110, 0) if mode == "RGBA" else (35, 67, 92))
    if mode == "RGBA":
        im.putpixel((5, 5), (220, 120, 20, 255))
    result = io.BytesIO()
    im.save(result, "PNG")
    return result.getvalue()


class CreatorMediaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        result = self.client.post("/api/v1/stories", json={
            "title": "La ciudad del sol",
            "premise": "Una viajera encuentra un castillo sobre las nubes.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(result.status_code, 201, result.text)
        self.story = result.json()["id"]
        char = self.client.post(f"/api/v1/stories/{self.story}/creator/characters",
            json={"name": "Aira", "description": "Una exploradora que protege la ciudad de cristal.",
                  "personality": "Curiosa", "dialogue_examples": "Aira: ¿Qué hacemos ahora?",
                  "visual_character_id": None, "voice_id": ""})
        self.assertEqual(char.status_code, 201, char.text)
        self.char = char.json()["id"]

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def upload(self, kind: str, label: str, caption: str,
               character_id: str | None = None, raw: bytes | None = None):
        form = {"kind": kind, "label": label, "caption": caption}
        if character_id:
            form["character_id"] = character_id
        return self.client.post(f"/api/v1/stories/{self.story}/creator/assets",
            data=form, files={"file": ("art.png", raw if raw is not None else image_bytes(), "image/png")})

    def test_owned_asset_paths_reject_traversal_and_symlinked_directories(self):
        service = self.app.state.creator_media
        with self.assertRaisesRegex(ValueError, "Invalid visual asset identifier"):
            service._path("../escape", str(uuid.uuid4()), "background")
        with self.assertRaisesRegex(ValueError, "Invalid visual asset identifier"):
            service._path(self.story, "../escape", "background")
        with self.assertRaisesRegex(ValueError, "Tipo"):
            service._path(self.story, str(uuid.uuid4()), "../outside")

        # A manipulated story-assets directory must never redirect writes
        # to another directory, even if all REST IDs are valid UUIDs.
        outside = Path(self.tmp.name).parent / ("noble-art-escape-" + str(uuid.uuid4()))
        outside.mkdir()
        base = Path(self.tmp.name) / "story-assets"
        base.mkdir(exist_ok=True)
        link = base / self.story
        try:
            link.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            outside.rmdir()
            self.skipTest("Filesystem disallows directory symlinks")
        try:
            response = self.upload("background", "No guardar", "Prueba de carpeta ajena")
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(list(outside.iterdir()), [])
        finally:
            link.unlink()
            outside.rmdir()

    def test_upload_preserves_foreground_alpha_and_background_is_webp(self):
        foreground = self.upload("foreground", "Aira sonríe", "Aira sonríe en el castillo",
                                 self.char)
        self.assertEqual(foreground.status_code, 201, foreground.text)
        self.assertEqual(foreground.json()["character_id"], self.char)
        raw = self.client.get(foreground.json()["url"])
        self.assertEqual(raw.status_code, 200)
        with Image.open(io.BytesIO(raw.content)) as img:
            self.assertEqual(img.format, "PNG")
            self.assertEqual(img.getpixel((0, 0))[3], 0)
            self.assertEqual(img.getpixel((5, 5))[3], 255)
        background = self.upload("background", "Castillo al sol",
                                 "castillo iluminado en la ciudad")
        self.assertEqual(background.status_code, 201, background.text)
        with Image.open(io.BytesIO(self.client.get(background.json()["url"]).content)) as img:
            self.assertEqual(img.format, "WEBP")
            self.assertEqual(img.mode, "RGB")

        # The app does not automatically create new art when the story begins.
        self.assertEqual(self.client.get(f"/api/v1/stories/{self.story}/visual-state")
                         .json()["assets"], [])
        not_yet = self.client.get(f"/api/v1/stories/{self.story}/creator/assets/scene")
        self.assertEqual(not_yet.status_code, 200)
        self.assertEqual(not_yet.json()["selection"], "no_match")

        self.app.state.narrative.append(
            self.story, str(uuid.uuid4()), "do", "Entrar",
            "Llegaron al castillo iluminado en la ciudad. Aira sonríe y observa el horizonte.",
            "fixture")
        shown = self.client.get(f"/api/v1/stories/{self.story}/creator/assets/scene")
        self.assertEqual(shown.status_code, 200, shown.text)
        self.assertEqual(shown.json()["background"]["id"], background.json()["id"])
        self.assertEqual(shown.json()["foreground"]["id"], foreground.json()["id"])
        self.assertFalse(shown.json()["generated"])
        self.assertEqual(_score("Aira sonríe", "Aira sonríe"), 30)
        self.assertEqual(_score("Aira sonríe", "Los pájaros cantan"), 0)

        changed = self.client.put(
            f"/api/v1/stories/{self.story}/creator/assets/{foreground.json()['id']}",
            json={"label": "Aira feliz", "caption": "Aira sonríe en el castillo"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["label"], "Aira feliz")

    def test_story_isolation_deletion_and_validation(self):
        imported = self.upload("foreground", "Aira", "Aira feliz en el bosque", self.char)
        self.assertEqual(imported.status_code, 201, imported.text)
        file = imported.json()["url"]
        other = self.client.post("/api/v1/stories", json={
            "title": "Otro reino", "premise": "En la montaña hay un templo.",
            "protagonist_name": "Lia"}).json()["id"]
        cross = file.replace(self.story, other)
        self.assertEqual(self.client.get(cross).status_code, 404)
        invalid = self.upload("background", "Mal personaje", "bosque con lluvia", self.char)
        self.assertEqual(invalid.status_code, 422)
        broken = self.upload("background", "Dañada", "lluvia en bosque", raw=b"not image")
        self.assertEqual(broken.status_code, 422)
        missing = self.client.delete(f"/api/v1/stories/{other}/creator/assets/{imported.json()['id']}")
        self.assertEqual(missing.status_code, 404)
        removed = self.client.delete(
            f"/api/v1/stories/{self.story}/creator/assets/{imported.json()['id']}")
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(self.client.get(file).status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/stories/{self.story}/creator/assets")
                         .json()["assets"], [])

    def test_fork_duplicates_art_and_remaps_npc(self):
        pic = self.upload("foreground", "Aira", "Aira asustada en el castillo", self.char)
        self.assertEqual(pic.status_code, 201, pic.text)
        branch = self.client.post(f"/api/v1/stories/{self.story}/fork", json={})
        self.assertEqual(branch.status_code, 201, branch.text)
        fork_id = branch.json()["id"]
        media = self.client.get(f"/api/v1/stories/{fork_id}/creator/assets").json()["assets"]
        self.assertEqual(len(media), 1)
        self.assertNotEqual(media[0]["id"], pic.json()["id"])
        self.assertEqual(media[0]["label"], "Aira")
        npc = self.client.get(f"/api/v1/stories/{fork_id}/creator/characters").json()["characters"]
        self.assertEqual(len(npc), 1)
        self.assertEqual(media[0]["character_id"], npc[0]["id"])
        self.assertEqual(self.client.get(media[0]["url"]).status_code, 200)
        self.assertEqual(self.client.get(media[0]["url"].replace(fork_id, self.story)).status_code, 404)
        self.client.delete(f"/api/v1/stories/{fork_id}/creator/assets/{media[0]['id']}")
        self.assertEqual(len(self.client.get(f"/api/v1/stories/{self.story}/creator/assets")
                              .json()["assets"]), 1)


    def test_editorial_cover_is_selected_and_stays_separate_from_scene(self):
        cover = self.upload("cover", "La ciudad del sol", "Portada del libro en una ciudad brillante")
        self.assertEqual(cover.status_code, 201, cover.text)
        selected = self.client.put(f"/api/v1/stories/{self.story}/creator/cover",
            json={"asset_id": cover.json()["id"]})
        self.assertEqual(selected.status_code, 200, selected.text)
        self.assertEqual(selected.json()["cover_asset_id"], cover.json()["id"])
        self.assertEqual(selected.json()["cover_image_url"], cover.json()["url"])
        with Image.open(io.BytesIO(self.client.get(cover.json()["url"]).content)) as img:
            self.assertEqual(img.format, "WEBP")
        listing = self.client.get("/api/v1/stories").json()["stories"]
        self.assertEqual(next(x for x in listing if x["id"] == self.story)["cover_image_url"],
                         cover.json()["url"])

        # Creating a new scene image must not replace the editorial artwork.
        scene = self.client.post(f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("scene.png", image_bytes("RGB"), "image/png")})
        self.assertEqual(scene.status_code, 200, scene.text)
        self.assertTrue(scene.json()["scene_image_url"])
        self.assertEqual(scene.json()["cover_image_url"], cover.json()["url"])
        self.assertNotEqual(scene.json()["scene_image_url"], cover.json()["url"])

        self.assertEqual(self.client.delete(
            f"/api/v1/stories/{self.story}/creator/assets/{cover.json()['id']}").status_code, 204)
        after = self.client.get(f"/api/v1/stories/{self.story}").json()
        self.assertIsNone(after["cover_asset_id"])
        self.assertIsNone(after["cover_image_url"])
        self.assertIsNotNone(after["scene_image_url"])

    def test_editorial_cover_selection_is_validated_and_cloned(self):
        cover = self.upload("cover", "Cielo de Aira", "Portada con cielo violeta")
        self.assertEqual(cover.status_code, 201, cover.text)
        background = self.upload("background", "Salón", "Habitación con vistas al mar")
        self.assertEqual(background.status_code, 201, background.text)
        url = f"/api/v1/stories/{self.story}/creator/cover"
        invalid = self.client.put(url, json={"asset_id": background.json()["id"]})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.client.put(url, json={"asset_id": str(uuid.uuid4())}).status_code, 422)
        self.assertEqual(self.client.put(url, json={"asset_id": "not-an-uuid"}).status_code, 422)
        self.assertEqual(self.client.put(url, json={"asset_id": cover.json()["id"]}).status_code, 200)
        fork = self.client.post(f"/api/v1/stories/{self.story}/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        child = fork.json()
        self.assertNotEqual(child["cover_asset_id"], cover.json()["id"])
        self.assertTrue(child["cover_image_url"])
        self.assertEqual(self.client.get(child["cover_image_url"]).status_code, 200)
        self.assertEqual(self.client.get(
            child["cover_image_url"].replace(child["id"], self.story)).status_code, 404)
        self.assertEqual(self.client.put(f"/api/v1/stories/{child['id']}/creator/cover",
            json={"asset_id": cover.json()["id"]}).status_code, 422)
        self.assertEqual(self.client.put(f"/api/v1/stories/{child['id']}/creator/cover",
            json={"asset_id": None}).status_code, 200)
        self.assertIsNone(self.client.get(f"/api/v1/stories/{child['id']}").json()["cover_image_url"])
        self.assertEqual(self.client.get(f"/api/v1/stories/{self.story}").json()["cover_image_url"],
                         cover.json()["url"])


if __name__ == "__main__":
    unittest.main()
