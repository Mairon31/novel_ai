"""Opt-in visual readiness: first-turn gating, explicit bypass, persistence.

No remote inference, GPU, or image generation is used by these tests.
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
from noble_api.main import create_app  # noqa: E402


def sample_webp() -> bytes:
    data = io.BytesIO()
    Image.new("RGB", (24, 24), "navy").save(data, format="PNG")
    return data.getvalue()


class VisualStartTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "Lighthouse of the forgotten",
            "premise": "An ancient lighthouse guards the memories of the city.",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.prefix = f"/api/v1/stories/{self.story}"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def status(self):
        return self.client.get(self.prefix + "/visual-preflight").json()

    def change_mode(self, mode: str):
        return self.client.put(self.prefix + "/creator", json={"visual_start": mode})

    def add(self, kind: str, character_id: str = "") -> str:
        data = {"kind": kind, "label": "Illustration", "caption": "An old coastal landscape"}
        if character_id:
            data["character_id"] = character_id
        response = self.client.post(self.prefix + "/creator/assets", data=data,
                                    files={"file": ("sample.png", sample_webp(), "image/png")})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_legacy_text_stories_do_not_require_art(self):
        status = self.status()
        self.assertEqual(status["mode"], "text")
        self.assertTrue(status["ready"])
        self.assertFalse(status["missing"])
        self.assertFalse(status["text_only"])

    def test_illustrated_preflight_blocks_first_turn_until_explicit_choice(self):
        response = self.change_mode("cover_background")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([x["kind"] for x in self.status()["missing"]],
                         ["cover", "background"])
        first = self.client.post(self.prefix + "/generate", json={
            "mode": "do", "input_text": "Open the door",
            "request_id": str(uuid.uuid4()),
        })
        self.assertEqual(first.status_code, 409, first.text)
        self.assertEqual(self.client.get(self.prefix + "/turns").json()["turns"], [])
        choice = self.client.put(self.prefix + "/visual-preflight/choice",
                                 json={"text_only": True})
        self.assertEqual(choice.status_code, 200, choice.text)
        self.assertTrue(choice.json()["ready"])
        with TestClient(create_app(Path(self.tmp.name))) as second:
            self.assertTrue(second.get(self.prefix + "/visual-preflight").json()["text_only"])
            second.put(self.prefix + "/visual-preflight/choice", json={"text_only": False})
            self.assertFalse(second.get(self.prefix + "/visual-preflight").json()["ready"])

    def test_images_become_ready_only_when_selected_and_files_exist(self):
        self.change_mode("cover_background")
        cover_id = self.add("cover")
        self.assertIn("cover", [x["kind"] for x in self.status()["missing"]])
        self.assertEqual(self.client.put(self.prefix + "/creator/cover",
                         json={"asset_id": cover_id}).status_code, 200)
        self.assertEqual([x["kind"] for x in self.status()["missing"]], ["background"])
        background_id = self.add("background")
        self.assertTrue(self.status()["ready"])
        path = self.app.state.creator_media._path(self.story, background_id, "background")
        path.unlink()
        self.assertEqual([x["kind"] for x in self.status()["missing"]], ["background"])

    def test_opening_is_gated_and_cast_mode_requires_neutral_portraits(self):
        self.client.put(self.prefix + "/creator", json={
            "visual_start": "cover_background_cast",
            "opening_scenarios": ["The clock rings at the lighthouse and a stranger arrives."],
        })
        npc = self.client.post(self.prefix + "/creator/characters", json={
            "name": "Mira", "description": "A determined guardian of the town lighthouse."
        })
        self.assertEqual(npc.status_code, 201, npc.text)
        opening = self.client.post(self.prefix + "/creator/opening", json={"index": 0})
        self.assertEqual(opening.status_code, 422, opening.text)
        self.assertEqual(self.client.get(self.prefix + "/turns").json()["turns"], [])
        cover = self.add("cover")
        self.client.put(self.prefix + "/creator/cover", json={"asset_id": cover})
        self.add("background")
        self.assertEqual([x["kind"] for x in self.status()["missing"]], ["character"])
        self.add("foreground", npc.json()["id"])
        self.assertTrue(self.status()["ready"])
        opening = self.client.post(self.prefix + "/creator/opening", json={"index": 0})
        self.assertEqual(opening.status_code, 201, opening.text)
        self.assertTrue(self.status()["has_started"])
        self.assertTrue(self.status()["ready"])

    def test_invalid_mode_and_nonexistent_story(self):
        self.assertEqual(self.change_mode("unknown").status_code, 422)
        missing = str(uuid.uuid4())
        self.assertEqual(self.client.get(f"/api/v1/stories/{missing}/visual-preflight").status_code, 404)
        self.assertEqual(self.client.put(
            f"/api/v1/stories/{missing}/visual-preflight/choice",
            json={"text_only": True}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
