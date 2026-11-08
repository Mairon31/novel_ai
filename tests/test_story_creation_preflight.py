"""Story preflight: whitespace/control validation and zero partial writes."""
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class StoryCreationPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_blank_fields_and_control_characters_never_create_orphans(self):
        base = {"title": "A proper title", "premise": "A world with rules and consequences.",
                "protagonist_name": "Alex"}
        bad = [
            {"title": "      "}, {"premise": " " * 30}, {"protagonist_name": "\\n"},
            {"title": "Good\\nBad"}, {"protagonist_name": "Alex\\tDeveloper"},
            {"premise": "A valid tale\\x00with null bytes."},
        ]
        for change in bad:
            with self.subTest(change=change):
                response = self.client.post("/api/v1/stories", json={**base, **change})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(self.client.get("/api/v1/stories").json()["stories"], [])
        with self.assertRaises(ValidationError):
            self.app.state.narrative.create_story("    ", base["premise"])
        self.assertEqual(self.client.get("/api/v1/stories").json()["stories"], [])

    def test_normalize_fields_and_keep_multiline_world_text(self):
        response = self.client.post("/api/v1/stories", json={
            "title": "  Forgotten islands  ",
            "premise": "  A city floats above the sea.\\nPeople remember old promises.  ",
            "protagonist_name": "  Luna  ",
        })
        self.assertEqual(response.status_code, 201, response.text)
        story = response.json()
        self.assertEqual(story["title"], "Forgotten islands")
        self.assertEqual(story["protagonist_name"], "Luna")
        self.assertEqual(story["premise"], "A city floats above the sea.\\nPeople remember old promises.")
        self.assertEqual(len(self.client.get("/api/v1/stories").json()["stories"]), 1)

if __name__ == "__main__":
    unittest.main()
