"""Canonical visual DNA and transactional five-cell expression-sheet import."""
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
from noble_api.main import create_app


def sheet(layout="horizontal", opaque=False):
    canvas = Image.new("RGBA", (80, 32) if layout == "horizontal"
                       else (32, 80), (0, 0, 0, 255 if opaque else 0))
    for index in range(5):
        x0, y0 = (index * 16, 0) if layout == "horizontal" else (0, index * 16)
        for y in range(y0 + 4, y0 + (28 if layout == "horizontal" else 12)):
            for x in range(x0 + 4, x0 + (12 if layout == "horizontal" else 28)):
                canvas.putpixel((x, y), (index * 40, 140, 220, 255 if opaque else 240))
    stream = io.BytesIO()
    canvas.save(stream, "PNG")
    return stream.getvalue()


class VisualIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        result = self.client.post("/api/v1/stories", json={
            "title": "Hoja de Aira",
            "premise": "Aira custodia una ciudad suspendida sobre las nubes.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(result.status_code, 201, result.text)
        self.story = result.json()["id"]
        self.base = f"/api/v1/stories/{self.story}"
        self.character = {
            "name": "Aira", "description": "Guardiana del antiguo archivo del castillo.",
        }

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def create_npc(self, dna=None):
        payload = dict(self.character)
        if dna is not None:
            payload["visual_dna"] = dna
        result = self.client.post(self.base + "/creator/characters", json=payload)
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def import_sheet(self, character_id, layout="horizontal", data=None):
        return self.client.post(
            self.base + f"/creator/characters/{character_id}/expression-sheet",
            data={"caption": "Aira castillo cristal", "pose": "standing",
                  "layout": layout},
            files={"file": ("sheet.png", sheet(layout) if data is None else data,
                            "image/png")},
        )

    def test_visual_dna_is_normalized_locked_and_legacy_updates_preserve_it(self):
        npc = self.create_npc({"tags": [" cabello negro ", "ojos verdes"],
                               "seed": 12345, "lora_name": "aira_v1.safetensors",
                               "lora_strength": 0.65})
        dna = npc["visual_dna"]
        self.assertEqual(dna["tags"], ["cabello negro", "ojos verdes"])
        self.assertEqual(dna["seed"], 12345)
        self.assertEqual(dna["lora_name"], "aira_v1.safetensors")
        endpoint = self.base + "/creator/characters/" + npc["id"]
        edited = self.client.put(endpoint, json={**self.character,
            "personality": "Muy prudente"})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["visual_dna"], dna)
        changed = self.client.put(endpoint, json={**self.character, "visual_dna":
            {**dna, "seed": 12346}})
        self.assertEqual(changed.status_code, 422)
        changed = self.client.put(endpoint, json={**self.character, "visual_dna":
            {**dna, "tags": ["ojos morados"]}})
        self.assertEqual(changed.status_code, 422)
        self.assertEqual(self.client.get(self.base + "/creator/characters")
                         .json()["characters"][0]["visual_dna"], dna)
        fork = self.client.post(self.base + "/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        copies = self.client.get(f"/api/v1/stories/{fork.json()['id']}/creator/characters")
        self.assertEqual(copies.json()["characters"][0]["visual_dna"], dna)

    def test_visual_dna_rejects_bad_lora_duplicate_tags_and_invalid_seed(self):
        for dna in (
            {"tags": ["cabello negro", "Cabello Negro"]},
            {"seed": -1},
            {"seed": 4294967296},
            {"lora_name": "../steal.safetensors"},
            {"lora_name": "https://host/model.safetensors"},
        ):
            result = self.client.post(self.base + "/creator/characters",
                                      json={**self.character, "visual_dna": dna})
            self.assertEqual(result.status_code, 422, (dna, result.text))

    def test_sheet_import_creates_five_owned_transparent_assets(self):
        npc = self.create_npc()
        result = self.import_sheet(npc["id"])
        self.assertEqual(result.status_code, 201, result.text)
        assets = result.json()["assets"]
        self.assertEqual(result.json()["count"], 5)
        self.assertEqual([asset["expression"] for asset in assets][::-1],
                         ["neutral", "joy", "anger", "sadness", "surprise"])
        for asset in assets:
            self.assertEqual(asset["character_id"], npc["id"])
            self.assertEqual(asset["pose"], "standing")
            image = self.client.get(asset["url"])
            self.assertEqual(image.status_code, 200)
            with Image.open(io.BytesIO(image.content)) as decoded:
                self.assertEqual(decoded.mode, "RGBA")
                self.assertEqual(decoded.size, (16, 32))
                self.assertEqual(decoded.getpixel((0, 0))[3], 0)
        second = self.import_sheet(npc["id"], "vertical")
        self.assertEqual(second.status_code, 201, second.text)
        for asset in second.json()["assets"]:
            with Image.open(io.BytesIO(self.client.get(asset["url"]).content)) as decoded:
                self.assertEqual(decoded.size, (32, 16))
        self.assertEqual(len(self.client.get(self.base + "/creator/assets")
                             .json()["assets"]), 10)
        self.app.state.narrative.append(
            self.story, str(uuid.uuid4()), "do", "Observar",
            "Aira sonríe en el castillo de cristal.", "sheet-offline-fixture")
        stage = self.client.get(self.base + "/creator/assets/scene")
        self.assertEqual(stage.status_code, 200, stage.text)
        self.assertEqual(stage.json()["sprites"][0]["expression"], "joy")
        fork = self.client.post(self.base + "/fork", json={})
        self.assertEqual(fork.status_code, 201, fork.text)
        cloned = self.client.get(
            f"/api/v1/stories/{fork.json()['id']}/creator/assets").json()["assets"]
        self.assertEqual(len(cloned), 10)
        self.assertNotEqual(cloned[0]["character_id"], npc["id"])

    def test_sheet_rejects_opaque_or_unowned_without_partial_files(self):
        npc = self.create_npc()
        bad = self.import_sheet(npc["id"], data=sheet(opaque=True))
        self.assertEqual(bad.status_code, 422)
        bad = self.import_sheet("00000000-0000-4000-8000-000000000001")
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(self.client.get(self.base + "/creator/assets")
                         .json()["assets"], [])

    def test_sqlite_insert_failure_rolls_back_entire_sheet_and_files(self):
        npc = self.create_npc()
        with self.app.state.narrative.store._conn() as db:
            db.execute("""CREATE TRIGGER block_sadness BEFORE INSERT ON creator_media_assets
                          WHEN NEW.expression='sadness'
                          BEGIN SELECT RAISE(ABORT, 'injected sheet failure'); END""")
        with self.assertRaises(Exception):
            self.app.state.creator_media.import_expression_sheet(
                self.story, npc["id"], sheet(), "Aira castillo cristal")
        with self.app.state.narrative.store._conn() as db:
            count = db.execute("SELECT COUNT(*) FROM creator_media_assets WHERE story_id=?",
                               (self.story,)).fetchone()[0]
        self.assertEqual(count, 0)
        folder = self.root / "story-assets" / self.story / "creator"
        self.assertFalse(list(folder.glob("*.png")) if folder.exists() else [])


if __name__ == "__main__":
    unittest.main()
