"""Real SQLite/Pillow regression tests for Noble AI's visual scene system.

No GPU model or image synthesis is simulated as proof of quality. These tests
exercise actual committed turns, image decoding, immutable gallery files,
selected version restoration, and character prompt persistence.
"""
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
from noble_api.visual_state import infer_location


def png(color: tuple[int, int, int]) -> bytes:
    original = Image.new("RGB", (110, 80), color)
    data = io.BytesIO()
    original.save(data, "PNG")
    return data.getvalue()


class VisualRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.app = create_app(self.path)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        self.story = self.client.post("/api/v1/stories", json={
            "title": "Bosque de cristal",
            "premise": "Una hechicera busca un jardín secreto detrás de la montaña.",
            "protagonist_name": "Luna",
        }).json()["id"]

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def state(self):
        r = self.client.get(f"/api/v1/stories/{self.story}/visual-state")
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def upload(self, color=(30, 50, 90)):
        return self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("scene.png", png(color), "image/png")})

    def test_immutable_versions_and_restore(self):
        self.assertEqual(self.state()["current_scene"]["detection"], "initial")
        first = self.upload((80, 90, 100))
        self.assertEqual(first.status_code, 200, first.text)
        first_bytes = self.client.get(
            f"/api/v1/stories/{self.story}/scene-image").content
        first_asset = self.state()["assets"][0]
        self.assertEqual(first_asset["origin"], "manual")
        self.assertEqual(len(first_asset["content_sha256"]), 64)
        self.assertTrue(first_asset["selected"])
        a1 = self.client.get(first_asset["url"])
        self.assertEqual(a1.status_code, 200)
        self.assertEqual(a1.content, first_bytes)
        with Image.open(io.BytesIO(a1.content)) as image:
            self.assertEqual(image.format, "WEBP")

        second = self.upload((180, 60, 40))
        self.assertEqual(second.status_code, 200, second.text)
        gallery = self.state()
        self.assertEqual(len(gallery["assets"]), 2)
        self.assertEqual(len({a["file_name"] for a in gallery["assets"]}), 2)
        self.assertEqual(len({a["content_sha256"] for a in gallery["assets"]}), 2)
        self.assertNotEqual(gallery["assets"][0]["id"], first_asset["id"])
        self.assertNotEqual(self.client.get(
            f"/api/v1/stories/{self.story}/scene-image").content, first_bytes)

        restored = self.client.post(
            f"/api/v1/stories/{self.story}/gallery/{first_asset['id']}/select")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["selected_asset_id"], first_asset["id"])
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/scene-image").content, first_bytes)
        wrong_story = self.client.post("/api/v1/stories", json={
            "title": "Otra historia", "premise": "Existe un pueblo entre montañas."}).json()["id"]
        cross = self.client.get(
            f"/api/v1/stories/{wrong_story}/gallery/{first_asset['id']}")
        self.assertEqual(cross.status_code, 404)
        self.assertEqual(len(self.state()["assets"]), 2)

    def test_scene_transition_only_on_completed_turn_and_no_auto_images(self):
        before = self.state()
        self.assertEqual(len(before["scenes"]), 1)
        self.assertIsNone(infer_location("«¡Llegaré al castillo pronto!»"))
        self.assertIsNone(infer_location("El castillo es muy antiguo."))
        self.assertIsNone(infer_location('La maga murmuró: «Llegaron al bosque».'))
        self.assertIsNone(infer_location("No llegaron al bosque de cristal."))
        turn = self.app.state.narrative.append(
            self.story, str(uuid.uuid4()), "do", "Avanzar",
            "Llegaron al bosque de cristal. El aire olía a lluvia.", "fixture")
        self.assertTrue(turn.get("scene_transition"), turn)
        current = self.state()
        self.assertEqual(len(current["scenes"]), 2)
        self.assertIn("bosque", current["current_scene"]["location"])
        self.assertEqual(current["current_scene"]["detection"], "heuristic")
        self.assertEqual(current["current_scene"]["source_turn_id"], turn["id"])
        self.assertEqual(current["assets"], [])
        for n in range(4):
            self.app.state.narrative.append(
                self.story, str(uuid.uuid4()), "continue", "",
                f"El viento sopló en los árboles. Turno {n}.", "fixture")
        self.assertEqual(len(self.state()["scenes"]), 2)
        confirmed = self.client.put(f"/api/v1/stories/{self.story}/scene",
                                    json={"location": "Castillo nevado"})
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.json()["current_scene"]["detection"], "confirmed")
        self.assertEqual(len(confirmed.json()["scenes"]), 3)
        unchanged = self.client.put(f"/api/v1/stories/{self.story}/scene",
                                    json={"location": "castillo nevado"})
        self.assertEqual(len(unchanged.json()["scenes"]), 3)
        self.assertEqual(self.state()["assets"], [])

    def test_persistent_visual_character_revisions_and_prompt_preview(self):
        person = {
            "name": "Aira", "appearance": "Cabello plateado hasta los hombros, ojos verdes.",
            "outfit": "Capa azul oscuro y botas marrones",
            "distinguishing_features": "Cicatriz pequeña sobre la ceja izquierda",
        }
        create = self.client.post(
            f"/api/v1/stories/{self.story}/visual-characters", json=person)
        self.assertEqual(create.status_code, 201, create.text)
        ident = create.json()["id"]
        self.assertEqual(create.json()["revision"], 1)
        preview = self.client.post(
            f"/api/v1/stories/{self.story}/illustration-prompt",
            json={"prompt": "Aira en una biblioteca iluminada por velas antiguas"})
        self.assertEqual(preview.status_code, 200, preview.text)
        result = preview.json()
        self.assertFalse(result["inference_used"])
        for expected in ("Cabello plateado", "Capa azul", "Cicatriz pequeña", "biblioteca"):
            self.assertIn(expected, result["prompt"])

        person["outfit"] = "Armadura de cuero y capa granate"
        update = self.client.put(
            f"/api/v1/stories/{self.story}/visual-characters/{ident}", json=person)
        self.assertEqual(update.status_code, 200, update.text)
        self.assertEqual(update.json()["revision"], 2)
        self.assertIn("granate", self.client.post(
            f"/api/v1/stories/{self.story}/illustration-prompt",
            json={"prompt": "Aira en una biblioteca iluminada por velas antiguas"}).json()["prompt"])
        duplicate = self.client.post(
            f"/api/v1/stories/{self.story}/visual-characters", json=person)
        self.assertEqual(duplicate.status_code, 422)
        another = create_app(self.path)
        with TestClient(another) as client:
            stored = client.get(f"/api/v1/stories/{self.story}/visual-state").json()
            self.assertEqual(len(stored["characters"]), 1)
            self.assertEqual(stored["characters"][0]["revision"], 2)
            self.assertEqual(stored["characters"][0]["id"], ident)

    def test_existing_legacy_art_is_migrated_once(self):
        legacy=self.path/"story-assets"/self.story/"scene.webp"
        legacy.parent.mkdir(parents=True,exist_ok=True)
        original=Image.new("RGB",(60,70),(130,70,45))
        original.save(legacy,"WEBP")
        self.assertEqual(len(self.app.state.visual.all(self.story)["assets"]),1)
        first=self.app.state.visual.all(self.story)
        self.assertEqual(len(first["assets"]),1)
        self.assertEqual(first["assets"][0]["origin"],"manual")
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/scene-image").content)>44,True)
        app2=create_app(self.path)
        with TestClient(app2) as client:
            again=client.get(f"/api/v1/stories/{self.story}/visual-state")
            self.assertEqual(again.status_code,200,again.text)
            self.assertEqual(len(again.json()["assets"]),1)
            self.assertEqual(again.json()["selected_asset_id"],first["selected_asset_id"])

    def test_invalid_images_dont_destroy_gallery(self):
        self.assertEqual(self.upload().status_code, 200)
        earlier = self.state()
        rejected = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("bad.png", b"fake png", "image/png")})
        self.assertEqual(rejected.status_code, 422)
        after = self.state()
        self.assertEqual(len(after["assets"]), 1)
        self.assertEqual(after["selected_asset_id"], earlier["selected_asset_id"])


if __name__ == "__main__":
    unittest.main()
