"""Argon P0 regression gates: durable SQLite settings and concurrent narrative writes.

The tests exercise real SQLite on disk, not a mocked connection; they do not
pretend to measure end-to-end multimedia concurrency or physical GPU behavior.
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.main import create_app


class SQLiteConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-audit-sqlite-")
        self.app = create_app(Path(self.tmp.name) / "data")
        self.store = self.app.state.store
        self.narrative = self.app.state.narrative

    def tearDown(self):
        self.tmp.cleanup()

    def test_transaction_rolls_back_all_writes_on_error(self):
        with self.assertRaisesRegex(RuntimeError, "simulated"):
            with self.store._conn() as conn:
                conn.execute("INSERT INTO settings(name,value) VALUES (?,?)",
                             ("audit_rollback_A", '"first"'))
                conn.execute("INSERT INTO settings(name,value) VALUES (?,?)",
                             ("audit_rollback_B", '"second"'))
                raise RuntimeError("simulated crash")
        with self.store._conn() as conn:
            rows = conn.execute("SELECT name FROM settings WHERE name LIKE 'audit_rollback_%'").fetchall()
        self.assertEqual(rows, [])

    def test_foreign_key_rejects_orphaned_story_turn(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.store._conn() as conn:
                conn.execute(
                    "INSERT INTO story_turns VALUES (?,?,?,?,?,?,?,?)",
                    (str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()),
                     "do", "open the door", "closed", "fixture", 1.0),
                )

    def test_turn_and_inferred_scene_roll_back_together(self):
        story = self.narrative.create_story(
            "Atomicidad visual", "Viaje al bosque de cristal.")
        story_id = story["id"]
        before = self.narrative.get_story(story_id)["updated_at"]
        request_id = str(uuid.uuid4())
        with patch.object(self.app.state.visual, "observe_turn_in_transaction",
                          side_effect=sqlite3.IntegrityError("simulated visual failure")):
            with self.assertRaisesRegex(sqlite3.IntegrityError, "simulated visual failure"):
                self.narrative.append(story_id, request_id, "do", "Avanzar",
                                      "Llegaron al bosque oscuro.", "fixture")
        self.assertIsNone(self.narrative.previous(story_id, request_id))
        self.assertEqual(self.narrative.get_story(story_id)["updated_at"], before)
        with self.store._conn() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM visual_scenes WHERE story_id=?",
                (story_id,)).fetchone()[0]
        self.assertEqual(count, 0)
        # The idempotency key can be retried successfully after rollback.
        committed = self.narrative.append(story_id, request_id, "do",
                                         "Avanzar", "Llegaron al bosque oscuro.", "fixture")
        self.assertEqual(committed["scene_transition"]["source_turn_id"], committed["id"])
        self.assertEqual(self.narrative.previous(story_id, request_id)["id"], committed["id"])

    def test_scene_transition_and_turn_commit_once_under_same_idempotency_key(self):
        story_id = self.narrative.create_story("Viaje único", "Puerta y bosque.")["id"]
        key = str(uuid.uuid4())
        one = self.narrative.append(story_id, key, "do", "Cruzar",
                                    "Entraron a la taberna del puerto.", "fixture")
        self.assertEqual(one["scene_transition"]["source_turn_id"], one["id"])
        duplicate = self.narrative.append(story_id, key, "do", "Cruzar",
                                         "Llegaron al castillo lejano.", "fixture")
        self.assertEqual(duplicate["id"], one["id"])
        with self.store._conn() as conn:
            scenes = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_scenes WHERE story_id=? ORDER BY created_at,id",
                (story_id,))]
            turns = conn.execute(
                "SELECT COUNT(*) FROM story_turns WHERE story_id=?",
                (story_id,)).fetchone()[0]
        self.assertEqual(turns, 1)
        self.assertEqual(len(scenes), 2)  # initial and one inferred transition
        self.assertEqual(scenes[-1]["source_turn_id"], one["id"])

    def test_fifty_concurrent_story_turn_writes_are_complete_and_unique(self):
        story = self.narrative.create_story(
            "Registro concurrente", "Una habitación silenciosa, sin cambios de escena.")
        story_id = story["id"]

        def write(i: int):
            return self.narrative.append(
                story_id, str(uuid.uuid4()), "do",
                "Observar punto " + str(i), "La habitación permanece tranquila.",
                "model-fixture",
            )

        # 50 independent writes across 12 physical threads contend for the same
        # SQLite database. Every request must commit exactly once.
        with ThreadPoolExecutor(max_workers=12) as pool:
            records = list(pool.map(write, range(50)))
        self.assertEqual(len(records), 50)
        self.assertEqual(len({record["id"] for record in records}), 50)
        saved = self.narrative.turns(story_id, limit=100)
        self.assertEqual(len(saved), 50)
        self.assertEqual(
            sorted(row["input_text"] for row in saved),
            sorted("Observar punto " + str(i) for i in range(50)),
        )


if __name__ == "__main__":
    unittest.main()
