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
