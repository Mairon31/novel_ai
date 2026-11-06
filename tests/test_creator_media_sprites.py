"""VN multilayer: bounded cast, expression/pose variants and no auto-GPU."""
from __future__ import annotations

import io
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


def transparent_png():
    canvas = Image.new("RGBA", (100, 140), (0, 0, 0, 0))
    for x in range(20, 80):
        for y in range(10, 130):
            canvas.putpixel((x, y), (75, 195, 245, 240))
    output = io.BytesIO()
    canvas.save(output, "PNG")
    return output.getvalue()


class SpriteStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        result = self.client.post("/api/v1/stories", json={
            "title": "El salón del cristal",
            "premise": "Un grupo de aventureros llega al salón de cristal.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(result.status_code, 201, result.text)
        self.story = result.json()["id"]
        self.base = f"/api/v1/stories/{self.story}"
        self.npcs = {}
        for name in ("Aira", "Bel", "Cora", "Daro"):
            response = self.client.post(self.base + "/creator/characters", json={
                "name": name, "description": name + " pertenece al gremio del castillo.",
                "personality": "Curiosa", "dialogue_examples": "",
            })
            self.assertEqual(response.status_code, 201, response.text)
            self.npcs[name] = response.json()["id"]

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def upload(self, kind, label, caption, name=None,
               expression="neutral", pose="standing"):
        response = self.client.post(
            self.base + "/creator/assets",
            data={"kind": kind, "label": label, "caption": caption,
                  "expression": expression, "pose": pose,
                  **({"character_id": self.npcs[name]} if name else {})},
            files={"file": ("sprite.png", transparent_png(), "image/png")})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def turn(self, narration):
        return self.app.state.narrative.append(
            self.story, str(uuid.uuid4()), "do", "Observar",
            narration, "sprite-offline-fixture",
        )

    def presentation(self, story=None):
        response = self.client.get(
            f"/api/v1/stories/{story or self.story}/creator/assets/scene")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_three_sprites_are_unique_focused_and_reuse_background_for_ten_turns(self):
        bg = self.upload("background", "Salón", "castillo salón cristal")
        a_neutral = self.upload("foreground", "Aira neutral",
                                "Aira en el castillo", "Aira")
        a_happy = self.upload("foreground", "Aira feliz",
                              "Aira en el castillo", "Aira",
                              expression="joy", pose="waving")
        bel = self.upload("foreground", "Bel neutral",
                          "Bel en el castillo", "Bel")
        cora = self.upload("foreground", "Cora neutral",
                           "Cora en el castillo", "Cora")
        self.upload("foreground", "Daro neutral", "Daro en el castillo", "Daro")
        self.assertEqual(self.presentation()["sprites"], [])
        story_art_before = self.client.get(self.base + "/visual-state").json()["assets"]
        self.assertEqual(story_art_before, [])

        with patch.object(self.app.state.images, "illustrate",
                          side_effect=AssertionError("No ComfyUI calls are allowed")):
            for number in range(10):
                self.turn(
                    "En el castillo salón cristal, Daro lee un pergamino. "
                    "Cora estudia los mapas. Bel contempla la luna. "
                    "Aira dice: «Bienvenidos». Aira sonríe junto a la puerta.")
                image = self.presentation()
                self.assertEqual(image["background"]["id"], bg["id"])
                self.assertEqual(len(image["sprites"]), 3)
                ids = [item["character_id"] for item in image["sprites"]]
                self.assertEqual(len(set(ids)), 3)
                self.assertNotIn(self.npcs["Daro"], ids)
                self.assertIn(a_happy["id"], [item["id"] for item in image["sprites"]])
                self.assertNotIn(a_neutral["id"],
                                 [item["id"] for item in image["sprites"]])
                self.assertIn(bel["id"], [item["id"] for item in image["sprites"]])
                self.assertIn(cora["id"], [item["id"] for item in image["sprites"]])
                self.assertTrue(image["sprites"][0]["speaker"])
                self.assertEqual(image["speaker_character_id"], self.npcs["Aira"])
                self.assertEqual(image["foreground"]["id"], image["sprites"][0]["id"])
                self.assertFalse(image["generated"])
        self.assertEqual(self.client.get(self.base + "/visual-state").json()["assets"], [])
        self.assertEqual(len(self.client.get(self.base + "/creator/assets").json()["assets"]), 6)

    def test_explicit_emotion_and_pose_validation_and_legacy_editor(self):
        smile = self.upload("foreground", "Aira feliz",
                            "Aira en el castillo", "Aira",
                            "joy", "waving")
        for expression, pose in [("evil", "standing"), ("neutral", "../break"),
                                  ("neutral", "x" * 33)]:
            result = self.client.post(
                self.base + "/creator/assets",
                data={"kind": "foreground", "label": "Inválido",
                      "caption": "Aira en el castillo",
                      "expression": expression, "pose": pose},
                files={"file": ("sprite.png", transparent_png(), "image/png")})
            self.assertEqual(result.status_code, 422, result.text)
        invalid_kind = self.client.post(
            self.base + "/creator/assets",
            data={"kind": "background", "label": "Inválido",
                  "caption": "castillo cristal", "expression": "joy"},
            files={"file": ("sprite.png", transparent_png(), "image/png")})
        self.assertEqual(invalid_kind.status_code, 422)
        rename = self.client.put(
            self.base + "/creator/assets/" + smile["id"],
            json={"label": "Retrato", "caption": "Aira en el castillo"})
        self.assertEqual(rename.status_code, 200, rename.text)
        self.assertEqual(rename.json()["expression"], "joy")
        self.assertEqual(rename.json()["pose"], "waving")
        revised = self.client.put(
            self.base + "/creator/assets/" + smile["id"],
            json={"label": "Neutral", "caption": "Aira en el castillo",
                  "expression": "neutral", "pose": "sitting"})
        self.assertEqual(revised.status_code, 200)
        self.assertEqual(revised.json()["pose"], "sitting")
        image = self.client.get(smile["url"])
        self.assertEqual(image.status_code, 200)
        with Image.open(io.BytesIO(image.content)) as decoded:
            self.assertEqual(decoded.format, "PNG")
            self.assertEqual(decoded.getpixel((0, 0))[3], 0)
        original = self.client.get(self.base + "/creator/assets").json()["assets"]
        self.assertEqual(len(original), 1)

    def test_expression_fallback_only_neutral_and_no_future_asset_leak_in_forks(self):
        original = self.upload("foreground", "Aira neutral",
                               "Aira en el castillo", "Aira")
        self.turn("En el castillo Aira sonríe, pero no hay variante feliz todavía.")
        self.assertEqual(self.presentation()["foreground"]["id"], original["id"])
        checkpoint = self.client.get(self.base + "/turns").json()["turns"][-1]["id"]
        future = self.upload("foreground", "Aira feliz",
                             "Aira en el castillo", "Aira", "joy", "waving")
        self.turn("En el castillo Aira sonríe de nuevo.")
        self.assertEqual(self.presentation()["foreground"]["id"], future["id"])
        fork = self.client.post(self.base + "/fork", json={"until_turn_id": checkpoint})
        self.assertEqual(fork.status_code, 201, fork.text)
        child = fork.json()["id"]
        branch_assets = self.client.get(
            f"/api/v1/stories/{child}/creator/assets").json()["assets"]
        self.assertEqual(len(branch_assets), 1)
        self.assertEqual(branch_assets[0]["expression"], "neutral")
        self.assertEqual(branch_assets[0]["pose"], "standing")
        self.assertNotEqual(branch_assets[0]["id"], original["id"])
        child_media = self.presentation(child)
        self.assertEqual(len(child_media["sprites"]), 1)
        self.assertEqual(child_media["foreground"]["id"], branch_assets[0]["id"])
        self.assertEqual(self.client.get(f"/api/v1/stories/{child}/creator/assets/"
                                         + future["id"] + "/file").status_code, 404)

    def test_sprite_variant_survives_archive_copy_and_keeps_character_owner(self):
        old = self.upload("foreground", "Aira sorprendida",
                          "Aira en el castillo", "Aira", "surprise", "kneeling")
        exported = self.client.get(self.base + "/archive.noble.zip")
        self.assertEqual(exported.status_code, 200, exported.text)
        imported = self.client.post(
            "/api/v1/stories/archive/import",
            params={"as_copy": "true"},
            files={"file": ("family.noble.zip", exported.content, "application/zip")})
        self.assertEqual(imported.status_code, 201, imported.text)
        copied_root = imported.json()["root_story_id"]
        asset_list = self.client.get(
            f"/api/v1/stories/{copied_root}/creator/assets").json()["assets"]
        self.assertEqual(len(asset_list), 1)
        asset = asset_list[0]
        self.assertNotEqual(asset["id"], old["id"])
        self.assertEqual(asset["expression"], "surprise")
        self.assertEqual(asset["pose"], "kneeling")
        self.assertNotEqual(asset["character_id"], self.npcs["Aira"])
        self.assertEqual(self.client.get(asset["url"]).status_code, 200)

    def test_upgrade_legacy_creator_media_table_preserves_rows(self):
        import sqlite3
        with tempfile.TemporaryDirectory(prefix="noble-old-sprite-") as folder:
            root = Path(folder)
            with sqlite3.connect(root / "noble.sqlite") as db:
                db.execute("""CREATE TABLE creator_media_assets(
                    id TEXT PRIMARY KEY, story_id TEXT NOT NULL, kind TEXT NOT NULL,
                    label TEXT NOT NULL, caption TEXT NOT NULL, character_id TEXT,
                    filename TEXT NOT NULL, media_type TEXT NOT NULL,
                    created_at REAL NOT NULL)""")
                db.execute("INSERT INTO creator_media_assets VALUES (?,?,?,?,?,?,?,?,?)",
                    (str(uuid.uuid4()), str(uuid.uuid4()), "foreground",
                     "Antiguo retrato", "Aira en el castillo", None,
                     "no-file.png", "image/png", 100.0))
            app = create_app(root)
            with app.state.store._conn() as db:
                row = db.execute(
                    "SELECT label,expression,pose FROM creator_media_assets").fetchone()
                self.assertEqual(row["label"], "Antiguo retrato")
                self.assertEqual(row["expression"], "neutral")
                self.assertEqual(row["pose"], "standing")
            reopened = create_app(root)
            with reopened.state.store._conn() as db:
                columns = [item["name"] for item in db.execute(
                    "PRAGMA table_info(creator_media_assets)")]
                self.assertEqual(columns.count("expression"), 1)
                self.assertEqual(columns.count("pose"), 1)

    def test_last_mention_is_not_automatically_assumed_to_be_speaker(self):
        self.upload("foreground", "Aira neutral",
                    "Aira en el castillo", "Aira")
        self.turn("Aira contempla en silencio el castillo; nadie pronuncia una palabra.")
        shot = self.presentation()
        self.assertIsNone(shot["speaker_character_id"])
        self.assertFalse(shot["sprites"][0]["speaker"])
        self.turn("Aira dice: «El castillo está abierto».")
        speech = self.presentation()
        self.assertEqual(speech["speaker_character_id"], self.npcs["Aira"])
        self.assertTrue(speech["sprites"][0]["speaker"])
        self.turn("«¿A dónde vamos?», preguntó Aira desde el castillo.")
        inverse = self.presentation()
        self.assertEqual(inverse["speaker_character_id"], self.npcs["Aira"])

    def test_no_character_name_no_leak_even_when_caption_matches(self):
        self.upload("foreground", "Aira en el castillo",
                    "castillo cristal", "Aira", "sadness")
        self.turn("El castillo de cristal está vacío y las puertas crujen.")
        self.assertEqual(self.presentation()["sprites"], [])
        self.assertEqual(self.presentation()["speaker_character_id"], None)


if __name__ == "__main__":
    unittest.main()
