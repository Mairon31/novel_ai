"""Branch map is complete, read-only and root-independent."""
from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


class BranchMapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-map-")
        self.app = create_app(Path(self.temp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        result = self.client.post("/api/v1/stories", json={
            "title": "El reino de cristal",
            "premise": "Un explorador descubre un reino secreto al otro lado del mar.",
        })
        self.assertEqual(result.status_code, 201)
        self.root = result.json()["id"]

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def branch(self, story, cutoff=None):
        result = self.client.post(f"/api/v1/stories/{story}/fork",
                                  json={"until_turn_id": cutoff})
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()["id"]

    def test_branch_tree_uses_parent_depth_and_counts_without_mutating_turns(self):
        turn = self.app.state.narrative.append(
            self.root, str(uuid.uuid4()), "do", "Camino", "El faro aparece.", "fixture")
        child = self.branch(self.root, turn["id"])
        grandchild = self.branch(child)
        sibling = self.branch(self.root)
        before = self.client.get("/api/v1/stories").json()["stories"]
        result = self.client.get(f"/api/v1/stories/{grandchild}/branches")
        self.assertEqual(result.status_code, 200, result.text)
        value = result.json()
        self.assertEqual(value["root_story_id"], self.root)
        self.assertEqual(value["selected_story_id"], grandchild)
        self.assertEqual(len(value["branches"]), 4)
        tree = {node["id"]: node for node in value["branches"]}
        self.assertEqual(tree[self.root]["depth"], 0)
        self.assertEqual(tree[child]["depth"], 1)
        self.assertEqual(tree[grandchild]["depth"], 2)
        self.assertEqual(tree[sibling]["depth"], 1)
        self.assertEqual(tree[child]["origin_turn_id"], turn["id"])
        self.assertEqual(tree[child]["turn_count"], 1)
        self.assertEqual(tree[grandchild]["turn_count"], 1)
        self.assertTrue(tree[grandchild]["is_selected"])
        self.assertFalse(tree[self.root]["is_selected"])
        other = self.client.get(f"/api/v1/stories/{self.root}/branches").json()
        self.assertEqual([node["id"] for node in value["branches"]],
                         [node["id"] for node in other["branches"]])
        self.assertEqual(before, self.client.get("/api/v1/stories").json()["stories"])

    def test_other_families_are_isolated_and_unknown_returns_404(self):
        other = self.client.post("/api/v1/stories", json={
            "title": "Bosque antiguo",
            "premise": "Una viajera encuentra vestigios de una ciudad olvidada.",
        }).json()["id"]
        self.branch(self.root)
        for story, expected in ((other, 1), (self.root, 2)):
            result = self.client.get(f"/api/v1/stories/{story}/branches")
            self.assertEqual(result.status_code, 200)
            self.assertEqual(len(result.json()["branches"]), expected)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{uuid.uuid4()}/branches").status_code, 404)

    def test_invalid_cycles_are_rejected(self):
        child = self.branch(self.root)
        with self.app.state.store._conn() as db:
            db.execute("UPDATE stories SET origin_story_id=? WHERE id=?",
                       (child, self.root))
        reply = self.client.get(f"/api/v1/stories/{child}/branches")
        self.assertEqual(reply.status_code, 422, reply.text)


if __name__ == "__main__":
    unittest.main()
