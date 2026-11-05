"""Visual gallery, identity and scene plans are scoped to the chosen turn."""
import io
import json
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


def png(color=(30, 50, 90)):
    stream = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(stream, format="PNG")
    return stream.getvalue()


class VisualTimelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.ctx = TestClient(self.app)
        self.client = self.ctx.__enter__()
        self.story = self.client.post("/api/v1/stories", json={
            "title": "Cronología visual",
            "premise": "Una viajera explora un castillo.",
            "protagonist_name": "Luna",
        }).json()["id"]
        self.narrative = self.app.state.narrative

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.tmp.cleanup()

    def step(self):
        return self.narrative.append(
            self.story, str(uuid.uuid4()), "do",
            "Exploro las ruinas", "Luna mira el horizonte.", "fixture")

    def state(self, ident):
        response = self.client.get(f"/api/v1/stories/{ident}/visual-state")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def image(self, color=(30, 50, 90)):
        response = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("art.png", png(color), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        return self.state(self.story)["assets"][0]["id"]

    def character(self, outfit="Capa azul", old_id=None):
        payload = {
            "name": "Luna", "appearance": "Cabello negro, ojos verdes",
            "outfit": outfit, "distinguishing_features": "Anillo plateado",
        }
        route = f"/api/v1/stories/{self.story}/visual-characters"
        response = (self.client.put(route + "/" + old_id, json=payload)
                    if old_id else self.client.post(route, json=payload))
        self.assertEqual(response.status_code, 200 if old_id else 201, response.text)
        return response.json()["id"]

    def plan(self, character_id, mood):
        response = self.client.put(
            f"/api/v1/stories/{self.story}/scene-plan", json={
                "shot": "closeup", "lighting": "night", "mood": mood,
                "visible_character_ids": [character_id],
                "reference_character_id": character_id,
            })
        self.assertEqual(response.status_code, 200, response.text)

    def fork(self, until_turn=None, source=None):
        response = self.client.post(
            f"/api/v1/stories/{source or self.story}/fork",
            json={"until_turn_id": until_turn})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_cutoff_blocks_future_gallery_character_edit_reference_and_plan(self):
        before_image = self.image()
        person = self.character()
        self.plan(person, "Paz inicial")
        before = self.step()
        self.character("Armadura secreta", person)
        future_image = self.image((200, 30, 40))
        response = self.client.put(
            f"/api/v1/stories/{self.story}/visual-characters/{person}/reference",
            json={"asset_id": future_image})
        self.assertEqual(response.status_code, 200, response.text)
        self.plan(person, "Revelación del villano")
        after = self.step()

        old = self.fork(before["id"])
        old_state = self.state(old)
        self.assertEqual(len(old_state["assets"]), 1)
        self.assertNotEqual(old_state["assets"][0]["id"], before_image)
        self.assertEqual(old_state["characters"][0]["outfit"], "Capa azul")
        self.assertIsNone(old_state["characters"][0]["reference_asset_id"])
        self.assertEqual(self.client.get(f"/api/v1/stories/{old}/scene-plan")
                         .json()["mood"], "Paz inicial")
        self.assertEqual(self.client.get(f"/api/v1/stories/{old}/scene-plan")
                         .json()["reference_character_id"],
                         old_state["characters"][0]["id"])

        late = self.fork(after["id"])
        new_state = self.state(late)
        self.assertEqual(len(new_state["assets"]), 2)
        self.assertEqual(new_state["characters"][0]["outfit"], "Armadura secreta")
        self.assertIsNotNone(new_state["characters"][0]["reference_asset_id"])
        self.assertEqual(self.client.get(f"/api/v1/stories/{late}/scene-plan")
                         .json()["mood"], "Revelación del villano")

    def test_upload_after_turn_in_same_scene_does_not_appear_in_old_branch(self):
        before = self.step()
        self.image()
        old = self.fork(before["id"])
        self.assertEqual(self.state(old)["assets"], [])
        self.assertIsNone(self.narrative.get_story(old)["scene_image_url"])

    def test_full_fork_retains_historical_gallery_for_nested_rewind(self):
        early_image = self.image()
        self.step()
        self.image((90, 120, 70))
        self.step()
        full = self.fork()
        first_turn = self.narrative.turns(full)[0]
        with self.app.state.store._conn() as db:
            snap = db.execute(
                "SELECT * FROM visual_turn_snapshots WHERE story_id=? AND turn_id=?",
                (full, first_turn["id"])).fetchone()
        self.assertIsNotNone(snap)
        ids = json.loads(snap["asset_ids_json"])
        self.assertEqual(len(ids), 1)
        self.assertNotIn(early_image, ids)
        rewound = self.fork(first_turn["id"], source=full)
        self.assertEqual(len(self.state(rewound)["assets"]), 1)

    def test_missing_legacy_snapshot_fails_closed(self):
        before = self.step()
        with self.app.state.store._conn() as db:
            db.execute("DELETE FROM visual_turn_snapshots WHERE turn_id=?",
                       (before["id"],))
        self.image()
        self.character()
        rewound = self.fork(before["id"])
        self.assertEqual(self.state(rewound)["assets"], [])
        self.assertEqual(self.state(rewound)["characters"], [])

    def test_snapshot_error_rolls_back_turn(self):
        with patch.object(self.app.state.visual, "snapshot_turn_in_transaction",
                          side_effect=RuntimeError("visual checkpoint failure")):
            with self.assertRaisesRegex(RuntimeError, "visual checkpoint failure"):
                self.step()
        with self.app.state.store._conn() as db:
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?",
                (self.story,)).fetchone()[0], 0)
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM visual_turn_snapshots WHERE story_id=?",
                (self.story,)).fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
