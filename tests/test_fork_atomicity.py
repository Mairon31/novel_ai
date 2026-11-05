"""Global fork transaction and filesystem compensation regression gates.

Failures are injected after each subsystem has already written its rows/files,
rather than before it does work. Each failure must leave no visible branch,
no cloned SQLite rows and no branch-owned files, while source data survives.
"""
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


def png() -> bytes:
    image = Image.new("RGB", (45, 38), (90, 150, 210))
    with io.BytesIO() as stream:
        image.save(stream, "PNG")
        return stream.getvalue()


TABLES = (
    "stories", "story_turns",
    "visual_scenes", "visual_assets", "visual_current", "visual_characters",
    "scene_plans", "creator_blueprints", "creator_characters",
    "creator_media_assets", "lorebook_entries", "world_states",
    "world_state_edits", "world_turn_snapshots",
)


class ForkAtomicityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-fork-atomic-")
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "La guardiana del faro",
            "premise": "Una antigua civilización guarda reliquias dentro del faro.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.narrative = self.app.state.narrative
        self.assets_root = self.root / "story-assets"
        self.narrative.append(self.story, str(uuid.uuid4()), "do",
                              "Exploro la playa", "La viajera observa la costa.", "fixture")
        # Both visual gallery and creator media are copied before later faults.
        gallery = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("scene.png", png(), "image/png")},
        )
        self.assertEqual(gallery.status_code, 200, gallery.text)
        asset = self.client.post(
            f"/api/v1/stories/{self.story}/creator/assets",
            data={"kind": "cover", "label": "Faro", "caption": "Faro al atardecer"},
            files={"file": ("cover.png", png(), "image/png")},
        )
        self.assertEqual(asset.status_code, 201, asset.text)
        self.assertEqual(self.client.put(
            f"/api/v1/stories/{self.story}/creator/cover",
            json={"asset_id": asset.json()["id"]},
        ).status_code, 200)
        person = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters",
            json={"name": "Aira", "description":
                  "Aira custodia la entrada al faro y conoce su historia antigua."},
        )
        self.assertEqual(person.status_code, 201, person.text)
        self.char = person.json()["id"]
        lore = self.client.post(
            f"/api/v1/stories/{self.story}/lorebook",
            json={"title": "El faro", "content": "El faro conserva un mapa que solo Aira conoce.",
                  "keys": ["faro"]},
        )
        self.assertEqual(lore.status_code, 201, lore.text)
        world = self.client.put(
            f"/api/v1/stories/{self.story}/world-state",
            json={"expected_revision": 0, "state": {
                "present_character_ids": [self.char],
                "facts": [{
                    "text": "Aira es la única que sabe abrir la cámara del faro.",
                    "public": False, "witness_character_ids": [self.char],
                }],
            }},
        )
        self.assertEqual(world.status_code, 200, world.text)
        self.narrative.append(self.story, str(uuid.uuid4()), "do",
                              "Entro al faro", "Aira muestra la entrada del faro.", "fixture")
        self.app.state.visual.all(self.story)
        self.start_counts = self.counts()
        self.start_dirs = self.branch_dirs()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def counts(self):
        with self.app.state.store._conn() as db:
            return {
                table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in TABLES
            }

    def branch_dirs(self):
        return {p.name for p in self.assets_root.iterdir()
                if p.is_dir()} if self.assets_root.exists() else set()

    def assert_unchanged(self):
        self.assertEqual(self.counts(), self.start_counts)
        self.assertEqual(self.branch_dirs(), self.start_dirs)
        self.assertEqual(
            list((self.root / "fork-staging").glob("*.pending")), [])
        self.assertEqual(
            self.client.get(f"/api/v1/stories/{self.story}/creator/assets")
            .json()["assets"][0]["kind"], "cover")
        self.assertEqual(
            self.client.get(f"/api/v1/stories/{self.story}/lorebook")
            .json()["entries"][0]["title"], "El faro")

    def test_late_failure_in_each_cloning_stage_leaves_no_branch_or_files(self):
        stages = [
            ("visual", "clone_branch"),
            ("creator", "clone"),
            ("creator_media", "clone"),
            ("lorebook", "clone"),
            ("world", "clone"),
        ]
        for stage, method in stages:
            with self.subTest(stage=stage):
                service = getattr(self.app.state, stage)
                original = getattr(service, method)

                def write_then_fail(*args, **kwargs):
                    original(*args, **kwargs)
                    raise RuntimeError("forced " + stage + " clone failure")

                with patch.object(service, method, side_effect=write_then_fail):
                    with self.assertRaisesRegex(RuntimeError, "forced " + stage):
                        self.narrative.fork_story(self.story)
                self.assert_unchanged()

    def test_failed_planner_copy_also_rolls_back_visual_and_story(self):
        planner = self.app.state.scene_planner
        original = planner.clone

        def write_then_fail(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError("planner copy interrupted")

        with patch.object(planner, "clone", side_effect=write_then_fail):
            with self.assertRaisesRegex(RuntimeError, "planner copy interrupted"):
                self.narrative.fork_story(self.story)
        self.assert_unchanged()

    def test_filesystem_copy_error_rolls_back_every_database_row(self):
        # Visual copy has already started when the next file copy fails.
        from noble_api import creator_media
        original = creator_media.shutil.copyfile

        def copy_then_fail(source, target, **kwargs):
            result = original(source, target, **kwargs)
            if "/creator/" in str(source).replace("\\", "/"):
                raise OSError("simulated disk copy failure")
            return result

        with patch.object(creator_media.shutil, "copyfile", side_effect=copy_then_fail):
            with self.assertRaisesRegex(OSError, "simulated disk copy failure"):
                self.narrative.fork_story(self.story)
        self.assert_unchanged()

    def test_startup_recovers_only_marked_orphan_branch_from_crash(self):
        abandoned = str(uuid.uuid4())
        folder = self.assets_root / abandoned
        folder.mkdir(parents=True)
        (folder / "interrupted.webp").write_bytes(b"unfinished-branch-file")
        staging = self.root / "fork-staging"
        staging.mkdir(exist_ok=True)
        (staging / (abandoned + ".pending")).write_text(abandoned, encoding="utf-8")
        # An unmarked UUID folder is not proof that Noble owns its contents.
        unmarked = self.assets_root / str(uuid.uuid4())
        unmarked.mkdir()
        (unmarked / "user-art.png").write_bytes(b"user-file")
        other = create_app(self.root)
        self.assertEqual(other.state.narrative.fork_recovery_report,
                         {"removed_orphans": 1, "retained_stories": 0, "conflicts": 0})
        self.assertFalse(folder.exists())
        self.assertFalse((staging / (abandoned + ".pending")).exists())
        self.assertEqual((unmarked / "user-art.png").read_bytes(), b"user-file")
        self.assertEqual(self.counts(), self.start_counts)
        self.assertEqual(self.narrative.get_story(self.story)["title"],
                         "La guardiana del faro")

    def test_stale_marker_after_successful_commit_keeps_story_and_media(self):
        complete = self.narrative.fork_story(self.story)
        branch_id = complete["id"]
        media = self.assets_root / branch_id / "scene.webp"
        self.assertTrue(media.exists())
        staging = self.root / "fork-staging"
        staging.mkdir(exist_ok=True)
        marker = staging / (branch_id + ".pending")
        marker.write_text(branch_id, encoding="utf-8")
        other = create_app(self.root)
        self.assertEqual(other.state.narrative.fork_recovery_report,
                         {"removed_orphans": 0, "retained_stories": 1, "conflicts": 0})
        self.assertFalse(marker.exists())
        self.assertEqual(other.state.narrative.get_story(branch_id)["id"], branch_id)
        self.assertTrue(media.exists())
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{branch_id}/lorebook").status_code, 200)

    def test_fork_recovery_refuses_symlink_and_does_not_erase_external_data(self):
        orphan = str(uuid.uuid4())
        external = self.root / "external-files"
        external.mkdir()
        (external / "keep-me").write_bytes(b"personal-file")
        self.assets_root.mkdir(exist_ok=True)
        alias = self.assets_root / orphan
        try:
            alias.symlink_to(external, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("Los symlinks no están disponibles")
        staging = self.root / "fork-staging"
        staging.mkdir(exist_ok=True)
        marker = staging / (orphan + ".pending")
        marker.write_text(orphan, encoding="utf-8")
        other = create_app(self.root)
        self.assertEqual(other.state.narrative.fork_recovery_report["conflicts"], 1)
        self.assertTrue(marker.exists())
        self.assertTrue(alias.is_symlink())
        self.assertEqual((external / "keep-me").read_bytes(), b"personal-file")
        alias.unlink()

    def test_successful_fork_publishes_all_modules_with_new_ids(self):
        branch = self.narrative.fork_story(self.story)
        self.assertIsNotNone(branch)
        self.assertNotEqual(branch["id"], self.story)
        self.assertIn(branch["id"], self.branch_dirs())
        self.assertTrue(branch["scene_image_url"])
        self.assertTrue(branch["cover_image_url"])
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{branch['id']}/lorebook").json()["entries"][0]["title"],
            "El faro")
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{branch['id']}/turns").json()["turns"]), 2)
        branch_world = self.client.get(
            f"/api/v1/stories/{branch['id']}/world-state").json()["state"]
        self.assertEqual(len(branch_world["facts"]), 1)
        self.assertNotEqual(branch_world["present_character_ids"], [self.char])
        copied_npc_id = branch_world["present_character_ids"][0]
        self.assertEqual(branch_world["facts"][0]["witness_character_ids"],
                         [copied_npc_id])
        self.assertEqual(self.narrative.get_story(self.story)["title"],
                         "La guardiana del faro")


if __name__ == "__main__":
    unittest.main()
