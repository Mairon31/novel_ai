"""Global fork transaction and filesystem compensation regression gates.

Failures are injected after each subsystem has already written its rows/files,
rather than before it does work. Each failure must leave no visible branch,
no cloned SQLite rows and no branch-owned files, while source data survives.
"""
from __future__ import annotations

import io
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
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
    "creator_media_assets", "creator_media_turn_snapshots",
    "creator_turn_snapshots", "visual_turn_snapshots",
    "lorebook_entries", "lorebook_turn_snapshots", "world_states",
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
        self.workers = []

    def tearDown(self):
        for proc in self.workers:
            if proc.poll() is None:
                proc.kill()
            proc.communicate(timeout=10)
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

    def test_missing_editorial_source_does_not_publish_partial_branch(self):
        # The DB still references this cover, but its file disappeared.
        with self.app.state.store._conn() as db:
            media = db.execute(
                "SELECT * FROM creator_media_assets WHERE story_id=?",
                (self.story,),
            ).fetchone()
        source = self.app.state.creator_media._path(
            self.story, media["id"], media["kind"])
        source.unlink()
        self.assertFalse(source.exists())
        with self.assertRaisesRegex(ValueError, "archivo editorial"):
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

    def test_successful_fork_fsyncs_marker_and_copied_bytes(self):
        # Captures actual os.fsync calls, not an in-memory fake write.
        original = os.fsync
        with patch("noble_api.narrative.os.fsync", wraps=original) as flushed:
            branch = self.narrative.fork_story(self.story)
        self.assertEqual(branch["origin_story_id"], self.story)
        self.assertGreaterEqual(flushed.call_count, 3)
        if os.name == "posix":
            # POSIX also flushes the staging directory, branch subdirectories
            # and the parent entry before SQLite's FULL WAL commit.
            self.assertGreaterEqual(flushed.call_count, 6)
        self.assertEqual(list((self.root / "fork-staging").glob("*.pending")), [])

    def test_file_sync_failure_rolls_back_complete_branch(self):
        with patch.object(self.narrative, "_sync_fork_files",
                          side_effect=OSError("simulated fsync write failure")):
            with self.assertRaisesRegex(OSError, "simulated fsync write failure"):
                self.narrative.fork_story(self.story)
        self.assert_unchanged()

    def test_marker_directory_sync_failure_is_rolled_back(self):
        stage = self.root / "fork-staging"
        original = self.narrative._fsync_directory

        def stop_at_marker(path):
            if path == stage:
                raise OSError("simulated staging fsync failure")
            return original(path)

        with patch.object(self.narrative, "_fsync_directory",
                          side_effect=stop_at_marker):
            with self.assertRaisesRegex(OSError, "simulated staging fsync failure"):
                self.narrative.fork_story(self.story)
        self.assert_unchanged()

    def test_new_branch_symlink_is_rejected_during_durable_sync(self):
        protected = self.root / "outside-private-file"
        protected.write_bytes(b"never delete this")
        original = self.narrative._sync_fork_files

        def inject_symlink(folder):
            alias = folder / "outside-link"
            try:
                alias.symlink_to(protected)
            except (NotImplementedError, OSError):
                self.skipTest("No se pueden crear symlinks para este usuario")
            return original(folder)

        with patch.object(self.narrative, "_sync_fork_files",
                          side_effect=inject_symlink):
            with self.assertRaisesRegex(ValueError, "simbólico"):
                self.narrative.fork_story(self.story)
        self.assertEqual(protected.read_bytes(), b"never delete this")
        self.assert_unchanged()

    def test_real_process_crash_after_copy_recovers_without_partial_branch(self):
        # A different Python process terminates with os._exit during a clone.
        # Unlike a raised exception, this bypasses all Python finally/rollback
        # handlers; SQLite must roll back its open transaction via OS close.
        child = """
import os
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from noble_api.main import create_app

app = create_app(Path(sys.argv[2]))
service = app.state.creator_media
original = service.clone

def crash_after_copies(*args, **kwargs):
    original(*args, **kwargs)
    os._exit(41)

service.clone = crash_after_copies
app.state.narrative.fork_story(sys.argv[3])
"""
        proc = subprocess.run(
            [sys.executable, "-c", child, str(ROOT / "apps" / "api"),
             str(self.root), self.story],
            capture_output=True, text=True, timeout=45, check=False,
        )
        self.assertEqual(proc.returncode, 41, proc.stderr)
        stage = self.root / "fork-staging"
        pending = list(stage.glob("*.pending"))
        self.assertEqual(len(pending), 1)
        abandoned_id = pending[0].stem
        self.assertTrue((self.assets_root / abandoned_id).is_dir())
        self.assertEqual(self.counts(), self.start_counts)
        recovered = create_app(self.root)
        self.assertEqual(recovered.state.narrative.fork_recovery_report,
                         {"removed_orphans": 1, "retained_stories": 0, "conflicts": 0})
        self.assertFalse((self.assets_root / abandoned_id).exists())
        self.assert_unchanged()


    # This script executes in an independent Python process, not a mocked
    # thread. It uses on-disk handshake signals so no timing assumptions are
    # needed to decide whether the SQLite commit has happened.
    KILL_WORKER = """
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from noble_api.main import create_app

root = Path(sys.argv[2])
story_id = sys.argv[3]
mode = sys.argv[4]
signal = Path(sys.argv[5])
app = create_app(root)
service = app.state.narrative

def publish(data):
    # Atomic handshake: parent never sees partially written JSON/UUID.
    temporary = signal.with_name(signal.name + ".tmp")
    temporary.write_text(data, encoding="utf-8")
    temporary.replace(signal)

def freeze(branch_id):
    publish(branch_id)
    while True:
        time.sleep(0.5)

if mode == "precommit":
    sync = service._sync_fork_files
    def sync_and_freeze(folder):
        result = sync(folder)
        freeze(folder.name)  # SQLite writer lock is still held.
        return result
    service._sync_fork_files = sync_and_freeze
elif mode == "postcommit":
    unlink = Path.unlink
    def unlink_and_freeze(path, *args, **kwargs):
        if path.suffix == ".pending" and path.parent == root / "fork-staging":
            freeze(path.stem)  # with-connection COMMIT already completed.
        return unlink(path, *args, **kwargs)
    Path.unlink = unlink_and_freeze
elif mode != "regular":
    raise ValueError("invalid fork worker mode")
branch = service.fork_story(story_id)
publish(json.dumps({
    "branch": branch["id"],
    "recovery": service.fork_recovery_report,
}))
"""

    def _spawn_fork_worker(self, mode):
        signal = self.root / ("worker-" + str(uuid.uuid4()) + ".signal")
        proc = subprocess.Popen(
            [sys.executable, "-c", self.KILL_WORKER,
             str(ROOT / "apps" / "api"), str(self.root),
             self.story, mode, str(signal)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        self.workers.append(proc)
        return proc, signal

    def _wait_for_worker_signal(self, proc, signal):
        deadline = time.monotonic() + 25
        while not signal.exists():
            if proc.poll() is not None:
                stdout, stderr = proc.communicate(timeout=5)
                self.fail("Worker terminated before handshake: "
                          + str(proc.returncode) + "\\n" + stdout + stderr)
            if time.monotonic() >= deadline:
                self.fail("Worker handshake timeout; status=" + str(proc.poll()))
            time.sleep(0.05)
        return signal.read_text(encoding="utf-8")

    @staticmethod
    def _stop_fork_worker(proc):
        if proc.poll() is None:
            proc.kill()  # SIGKILL on POSIX, TerminateProcess on Windows.
        proc.communicate(timeout=10)

    def test_sigkill_precommit_unblocks_competing_process_and_recovery(self):
        held, held_signal = self._spawn_fork_worker("precommit")
        abandoned_id = self._wait_for_worker_signal(held, held_signal)
        self.assertTrue((self.assets_root / abandoned_id).is_dir())
        self.assertTrue((self.root / "fork-staging" /
                         (abandoned_id + ".pending")).exists())
        self.assertEqual(self.counts(), self.start_counts)

        # The contender is a *second process*: it must wait for the SQLite
        # writer lock and cannot mistake an in-flight fork for an orphan.
        contender, contender_signal = self._spawn_fork_worker("regular")
        time.sleep(0.35)
        self.assertIsNone(contender.poll())
        self.assertEqual(self.counts(), self.start_counts)
        self._stop_fork_worker(held)
        result = json.loads(self._wait_for_worker_signal(contender, contender_signal))
        self.assertEqual(contender.wait(timeout=10), 0)
        self.assertEqual(result["recovery"]["removed_orphans"], 1)
        branch = result["branch"]
        self.assertNotEqual(branch, abandoned_id)
        self.assertFalse((self.assets_root / abandoned_id).exists())
        self.assertTrue((self.assets_root / branch / "scene.webp").is_file())
        self.assertIsNone(self.narrative.get_story(abandoned_id))
        self.assertIsNotNone(self.narrative.get_story(branch))
        self.assertIsNotNone(self.narrative.get_story(self.story))
        self.assertEqual(list((self.root / "fork-staging").glob("*.pending")), [])
        self.assertEqual(len(self.client.get("/api/v1/stories").json()["stories"]), 2)

    def test_sigkill_after_sqlite_commit_retains_complete_branch(self):
        committed, signal = self._spawn_fork_worker("postcommit")
        branch = self._wait_for_worker_signal(committed, signal)
        marker = self.root / "fork-staging" / (branch + ".pending")
        self.assertTrue(marker.exists())
        self.assertIsNotNone(self.narrative.get_story(branch))
        self.assertTrue((self.assets_root / branch / "scene.webp").is_file())
        self.assertTrue((self.assets_root / branch / "creator").is_dir())
        self._stop_fork_worker(committed)

        restarted = create_app(self.root)
        self.assertEqual(restarted.state.narrative.fork_recovery_report,
                         {"removed_orphans": 0, "retained_stories": 1,
                          "conflicts": 0})
        self.assertFalse(marker.exists())
        self.assertTrue((self.assets_root / branch / "scene.webp").is_file())
        self.assertEqual(len(restarted.state.narrative.turns(branch)), 2)
        self.assertEqual(
            restarted.state.creator_media.list(branch)[0]["kind"], "cover")
        self.assertIsNotNone(restarted.state.narrative.get_story(self.story))

    def test_two_killed_processes_serialized_recover_both_without_data_loss(self):
        first, first_signal = self._spawn_fork_worker("precommit")
        first_id = self._wait_for_worker_signal(first, first_signal)
        second, second_signal = self._spawn_fork_worker("precommit")
        time.sleep(0.25)
        self.assertIsNone(second.poll())
        self._stop_fork_worker(first)
        # The second startup reconciles the first orphan after acquiring
        # SQLite's writer lock; then its own fork reaches pre-commit.
        second_id = self._wait_for_worker_signal(second, second_signal)
        self.assertNotEqual(first_id, second_id)
        self.assertFalse((self.assets_root / first_id).exists())
        self._stop_fork_worker(second)

        restarted = create_app(self.root)
        self.assertEqual(restarted.state.narrative.fork_recovery_report,
                         {"removed_orphans": 1, "retained_stories": 0,
                          "conflicts": 0})
        self.assertFalse((self.assets_root / second_id).exists())
        self.assertEqual(self.counts(), self.start_counts)
        self.assert_unchanged()

    def test_two_simultaneous_forks_commit_complete_independent_copies(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(
                lambda _: self.narrative.fork_story(self.story), range(2)))
        first, second = results
        self.assertNotEqual(first["id"], second["id"])
        for branch in results:
            self.assertTrue(branch["scene_image_url"])
            self.assertTrue(branch["cover_image_url"])
            self.assertIn(branch["id"], self.branch_dirs())
            with self.app.state.store._conn() as db:
                for table in ("story_turns", "visual_assets",
                              "creator_media_assets", "lorebook_entries",
                              "world_turn_snapshots"):
                    self.assertGreater(
                        db.execute(f"SELECT COUNT(*) FROM {table} WHERE story_id=?",
                                   (branch["id"],)).fetchone()[0], 0)
            self.assertTrue((self.assets_root / branch["id"] / "scene.webp").is_file())
        self.assertEqual(
            list((self.root / "fork-staging").glob("*.pending")), [])
        self.assertEqual(
            self.client.get(f"/api/v1/stories/{self.story}/turns").json()["turns"]
            [0]["input_text"], "Exploro la playa")

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


    def test_recovery_flushes_orphan_directory_and_stale_marker_removal(self):
        from noble_api.narrative import NarrativeService

        completed = self.narrative.fork_story(self.story)
        committed_id = completed["id"]
        orphan_id = str(uuid.uuid4())
        orphan_folder = self.assets_root / orphan_id
        orphan_folder.mkdir(parents=True)
        (orphan_folder / "aborted.webp").write_bytes(b"unfinished")
        stage = self.root / "fork-staging"
        stage.mkdir(exist_ok=True)
        for branch_id in (committed_id, orphan_id):
            (stage / (branch_id + ".pending")).write_text(
                branch_id, encoding="utf-8")

        actual_sync = NarrativeService._fsync_directory
        synchronized = []

        def trace_directory(path):
            synchronized.append(path)
            return actual_sync(path)

        with patch.object(NarrativeService, "_fsync_directory",
                          staticmethod(trace_directory)):
            recovered = create_app(self.root)
        self.assertEqual(recovered.state.narrative.fork_recovery_report,
                         {"removed_orphans": 1, "retained_stories": 1, "conflicts": 0})
        self.assertIn(self.assets_root, synchronized)
        self.assertGreaterEqual(synchronized.count(stage), 2)
        self.assertFalse(orphan_folder.exists())
        self.assertFalse(list(stage.glob("*.pending")))
        self.assertTrue((self.assets_root / committed_id / "scene.webp").is_file())
        self.assertIsNotNone(self.narrative.get_story(self.story))

    def test_failed_recovery_directory_sync_keeps_marker_for_retry(self):
        from noble_api.narrative import NarrativeService

        orphan_id = str(uuid.uuid4())
        folder = self.assets_root / orphan_id
        folder.mkdir(parents=True)
        (folder / "aborted.webp").write_bytes(b"unfinished")
        stage = self.root / "fork-staging"
        stage.mkdir(exist_ok=True)
        marker = stage / (orphan_id + ".pending")
        marker.write_text(orphan_id, encoding="utf-8")
        original_sync = NarrativeService._fsync_directory

        def fail_parent_sync(path):
            if path == self.assets_root:
                raise OSError("simulated recovery directory sync failure")
            return original_sync(path)

        with patch.object(NarrativeService, "_fsync_directory",
                          staticmethod(fail_parent_sync)):
            incomplete = create_app(self.root)
        self.assertEqual(incomplete.state.narrative.fork_recovery_report,
                         {"removed_orphans": 0, "retained_stories": 0, "conflicts": 1})
        self.assertTrue(marker.exists())
        self.assertFalse(folder.exists())

        recovered = create_app(self.root)
        self.assertEqual(recovered.state.narrative.fork_recovery_report,
                         {"removed_orphans": 1, "retained_stories": 0, "conflicts": 0})
        self.assertFalse(marker.exists())
        self.assertEqual(self.counts(), self.start_counts)
        self.assertEqual(self.branch_dirs(), self.start_dirs)
        self.assertIsNotNone(self.narrative.get_story(self.story))

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
