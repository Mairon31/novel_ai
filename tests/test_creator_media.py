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


if __name__ == "__main__":
    unittest.main()
