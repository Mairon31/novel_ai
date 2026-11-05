"""Deterministic four-action visual director and reusable manual background cache."""
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


def png(color=(45, 95, 150)):
    buffer = io.BytesIO()
    Image.new("RGB", (80, 60), color).save(buffer, "PNG")
    return buffer.getvalue()


class VisualDirectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-director-")
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "El bosque de cristal",
            "premise": "Una exploradora visita un bosque que cambia cada noche.",
            "protagonist_name": "Nora",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.base = f"/api/v1/stories/{self.story}"
        self.visual = self.app.state.visual

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def upload(self, story=None, color=(45, 95, 150)):
        ident = story or self.story
        result = self.client.post(f"/api/v1/stories/{ident}/scene-image",
                                  files={"file": ("forest.png", png(color), "image/png")})
        self.assertEqual(result.status_code, 200, result.text)
        art = self.client.get(f"/api/v1/stories/{ident}/visual-state")
        return art.json()["selected_asset_id"]

    def preview(self, intent="auto", story=None):
        return self.client.post(
            f"/api/v1/stories/{story or self.story}/visual-director/preview",
            json={"intent": intent})

    def register(self, ident, key, story=None):
        return self.client.post(
            f"/api/v1/stories/{story or self.story}/visual-director/backgrounds/{ident}",
            json={"expected_cache_key": key})

    def save_world(self, time_of_day="noche", weather="lluvia", revision=0):
        result = self.client.put(self.base + "/world-state", json={
            "expected_revision": revision,
            "state": {
                "location": "Bosque de cristal",
                "time_of_day": time_of_day,
                "weather": weather,
            },
        })
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()["revision"]

    def save_plan(self, shot="wide", lighting="natural", mood="alegre"):
        result = self.client.put(self.base + "/scene-plan", json={
            "shot": shot, "lighting": lighting, "mood": mood,
            "direction": "", "visible_character_ids": [],
            "reference_character_id": None,
        })
        self.assertEqual(result.status_code, 200, result.text)

    def test_context_cache_ignores_emotion_but_invalidates_shot_time_weather_light(self):
        self.save_world()
        self.save_plan()
        initial = self.preview()
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertEqual(initial.json()["action"], "GENERATE_NEW_BACKGROUND")
        self.assertFalse(initial.json()["background_cached"])
        self.assertFalse(initial.json()["inference_used"])
        self.assertFalse(initial.json()["generation_started"])
        original_key = initial.json()["cache_key"]
        asset = self.upload()
        added = self.register(asset, original_key)
        self.assertEqual(added.status_code, 200, added.text)
        self.assertEqual(added.json()["action"], "REUSE_BACKGROUND")
        self.assertEqual(added.json()["background_asset_id"], asset)

        self.save_plan(mood="furioso")
        same = self.preview()
        self.assertEqual(same.json()["cache_key"], original_key)
        self.assertEqual(same.json()["action"], "REUSE_BACKGROUND")
        self.save_plan(shot="closeup")
        self.assertEqual(self.preview().json()["action"], "GENERATE_NEW_BACKGROUND")
        self.save_plan(shot="wide", lighting="night")
        self.assertEqual(self.preview().json()["action"], "GENERATE_NEW_BACKGROUND")
        self.save_plan(shot="wide", lighting="natural")
        self.assertEqual(self.preview().json()["action"], "REUSE_BACKGROUND")
        revision = self.save_world(time_of_day="tarde", revision=1)
        self.assertEqual(self.preview().json()["action"], "GENERATE_NEW_BACKGROUND")
        self.save_world(time_of_day="noche", weather="soleado", revision=revision)
        self.assertEqual(self.preview().json()["action"], "GENERATE_NEW_BACKGROUND")
        self.save_world(time_of_day="noche", weather="lluvia", revision=revision + 1)
        self.assertEqual(self.preview().json()["cache_key"], original_key)
        self.assertEqual(self.preview().json()["action"], "REUSE_BACKGROUND")

    def test_emotion_and_event_are_directions_not_fake_image_generation(self):
        self.save_world()
        asset = self.upload()
        signature = self.preview().json()["cache_key"]
        self.assertEqual(self.preview("emotion").json()["action"],
                         "GENERATE_NEW_BACKGROUND")
        self.register(asset, signature)
        with patch.object(self.app.state.images, "illustrate",
                          side_effect=AssertionError("Unexpected ComfyUI inference")):
            expression = self.preview("emotion").json()
            self.assertEqual(expression["action"], "UPDATE_SPRITE_EMOTION")
            self.assertEqual(expression["background_asset_id"], asset)
            event = self.preview("event").json()
            self.assertEqual(event["action"], "GENERATE_EVENT_CG")
            self.assertEqual(event["background_asset_id"], asset)
            self.assertFalse(event["generation_started"])
            self.assertFalse(event["inference_used"])
        self.assertEqual(self.preview("unknown").status_code, 422)

    def test_apply_reuses_image_without_new_asset_and_stale_context_is_rejected(self):
        revision = self.save_world()
        old = self.upload(color=(15, 25, 50))
        candidate = self.upload(color=(220, 90, 45))
        self.visual.choose(self.story, old)
        signature = self.preview().json()["cache_key"]
        self.assertEqual(self.register(candidate, signature).status_code, 200)
        before = len(self.client.get(self.base + "/visual-state").json()["assets"])
        self.save_world(time_of_day="amanecer", revision=revision)
        stale = self.client.post(self.base + "/visual-director/apply", json={
            "asset_id": candidate, "expected_cache_key": signature,
        })
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(self.client.get(self.base + "/visual-state"
                                         ).json()["selected_asset_id"], old)
        self.save_world(time_of_day="noche", revision=revision + 1)
        applied = self.client.post(self.base + "/visual-director/apply", json={
            "asset_id": candidate, "expected_cache_key": signature,
        })
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertTrue(applied.json()["background_cached"])
        self.assertFalse(applied.json()["generation_started"])
        final = self.client.get(self.base + "/visual-state").json()
        self.assertEqual(final["selected_asset_id"], candidate)
        self.assertEqual(len(final["assets"]), before)

    def test_forks_retain_cache_and_assets_without_cross_story_leakage(self):
        self.save_world()
        asset = self.upload()
        signature = self.preview().json()["cache_key"]
        self.register(asset, signature)
        fork = self.client.post(self.base + "/fork",
                                json={"until_turn_id": None})
        self.assertEqual(fork.status_code, 201, fork.text)
        branch = fork.json()["id"]
        candidate = self.preview(story=branch)
        self.assertEqual(candidate.status_code, 200, candidate.text)
        self.assertEqual(candidate.json()["action"], "REUSE_BACKGROUND")
        self.assertEqual(candidate.json()["cache_key"], signature)
        self.assertNotEqual(candidate.json()["background_asset_id"], asset)
        from_branch = candidate.json()["background_asset_id"]
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{branch}/gallery/{from_branch}").status_code, 200)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{branch}/gallery/{asset}").status_code, 404)
        self.assertEqual(self.register(from_branch, signature, self.story).status_code, 422)

    def test_generated_asset_signature_is_never_clobbered_by_manual_background_cache(self):
        asset = self.upload()
        key = self.preview().json()["cache_key"]
        with self.app.state.store._conn() as db:
            db.execute(
                "UPDATE visual_assets SET origin='comfyui',render_signature='old-generation-key' "
                "WHERE id=?", (asset,))
        result = self.register(asset, key)
        self.assertEqual(result.status_code, 422, result.text)
        with self.app.state.store._conn() as db:
            signature = db.execute(
                "SELECT render_signature FROM visual_assets WHERE id=?",
                (asset,)).fetchone()[0]
        self.assertEqual(signature, "old-generation-key")
        self.assertFalse(self.preview().json()["background_cached"])

    def test_preview_does_not_create_art_or_turns(self):
        with self.app.state.store._conn() as db:
            before = db.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?", (self.story,)
            ).fetchone()[0]
        with patch.object(self.app.state.images, "illustrate",
                          side_effect=AssertionError("Provider must not run")):
            self.assertEqual(self.preview().status_code, 200)
        with self.app.state.store._conn() as db:
            after = db.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?", (self.story,)
            ).fetchone()[0]
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
