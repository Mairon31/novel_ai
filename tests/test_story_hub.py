"""Bundled story packs are real editable worlds, atomically installed, offline."""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app
from noble_api.story_hub import PACKS, PACK_BY_ID, InstallStoryPack, StoryHubService


class StoryHubTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_catalog_exposes_three_original_worlds_without_private_secrets(self):
        response = self.client.get("/api/v1/story-hub")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["source"], "bundled-original")
        self.assertFalse(payload["community_online"])
        self.assertEqual(len(payload["packs"]), 3)
        for item in payload["packs"]:
            with self.subTest(item=item["id"]):
                self.assertEqual(item["license"], "CC0-1.0")
                self.assertEqual(item["source"], "bundled-original")
                self.assertEqual(item["language"], "es-419")
                self.assertFalse(item["has_images"])
                self.assertGreaterEqual(item["character_count"], 3)
                self.assertGreaterEqual(item["lore_count"], 2)
                self.assertEqual(len(item["opening_previews"]), 3)
                self.assertNotIn("ai_plot", item)
                self.assertNotIn("guidelines", item)
                self.assertNotIn("reminder", item)
                self.assertNotIn("lore", item)
                self.assertNotIn("characters", item)
                self.assertEqual(
                    self.client.get("/api/v1/story-hub/" + item["id"]).json(),
                    item)
                self.assertNotIn(PACK_BY_ID[item["id"]]["ai_plot"],
                                 json.dumps(payload))
        self.assertEqual(
            self.client.get("/api/v1/story-hub/unknown").status_code, 404)

    def test_every_pack_installs_author_content_and_starts_real_opening(self):
        for template in PACKS:
            with self.subTest(pack=template["id"]):
                response = self.client.post(
                    "/api/v1/story-hub/" + template["id"] + "/install",
                    json={})
                self.assertEqual(response.status_code, 201, response.text)
                result = response.json()
                story_id = result["story"]["id"]
                self.assertEqual(result["characters_installed"],
                                 len(template["characters"]))
                self.assertEqual(result["lore_installed"], len(template["lore"]))
                self.assertEqual(result["openings_installed"], 3)
                self.assertEqual(result["story"]["title"], template["title"])
                prefix = "/api/v1/stories/" + story_id
                blueprint = self.client.get(prefix + "/creator").json()
                self.assertEqual(blueprint["ai_plot"], template["ai_plot"])
                self.assertEqual(blueprint["language"], "es-419")
                self.assertEqual(len(blueprint["opening_scenarios"]), 3)
                people = self.client.get(prefix + "/creator/characters").json()[
                    "characters"]
                self.assertEqual(len(people), len(template["characters"]))
                self.assertTrue(all(x["description"] and x["personality"]
                                    and x["dialogue_examples"] for x in people))
                lore = self.client.get(prefix + "/lorebook").json()["entries"]
                self.assertEqual(len(lore), len(template["lore"]))
                self.assertTrue(all(x["keys"] for x in lore))
                first = self.client.post(prefix + "/creator/opening",
                                         json={"index": 1})
                self.assertEqual(first.status_code, 201, first.text)
                self.assertEqual(first.json()["model"], "inicio-del-creador")
                self.assertNotIn("{{user}}", first.json()["assistant_text"])
                self.assertEqual(
                    self.client.post(prefix + "/creator/opening",
                                     json={"index": 2}).status_code, 422)

    def test_repeated_install_is_independent_and_preserves_original(self):
        endpoint = "/api/v1/story-hub/ultima-luna/install"
        a = self.client.post(endpoint, json={"protagonist_name": "Luna"})
        b = self.client.post(endpoint, json={"protagonist_name": "Sofi"})
        self.assertEqual((a.status_code, b.status_code), (201, 201))
        one = a.json()["story"]["id"]
        two = b.json()["story"]["id"]
        self.assertNotEqual(one, two)
        self.assertEqual(a.json()["story"]["protagonist_name"], "Luna")
        self.assertEqual(b.json()["story"]["protagonist_name"], "Sofi")
        prefix = "/api/v1/stories/"
        first = self.client.get(prefix + one + "/creator/characters").json()[
            "characters"]
        second = self.client.get(prefix + two + "/creator/characters").json()[
            "characters"]
        self.assertTrue(set(x["id"] for x in first).isdisjoint(
            x["id"] for x in second))
        self.client.put(prefix + one + "/creator", json={
            "synopsis": "Otra versión totalmente diferente."
        })
        self.assertEqual(
            self.client.get(prefix + two + "/creator").json()["synopsis"],
            PACK_BY_ID["ultima-luna"]["synopsis"])
        self.assertEqual(len(self.client.get(prefix + two + "/lorebook").json()[
            "entries"]), 3)
        self.assertEqual(
            self.client.get("/api/v1/story-hub").json()["packs"][0]["title"],
            PACK_BY_ID["ultima-luna"]["title"])

    def test_unknown_pack_and_bad_user_input_never_insert_story(self):
        before = len(self.client.get("/api/v1/stories").json()["stories"])
        self.assertEqual(self.client.post(
            "/api/v1/story-hub/missing/install", json={}).status_code, 404)
        self.assertEqual(self.client.post(
            "/api/v1/story-hub/ultima-luna/install",
            json={"protagonist_name": " "}).status_code, 422)
        self.assertEqual(self.client.post(
            "/api/v1/story-hub/ultima-luna/install",
            json={"untrusted": "value"}).status_code, 422)
        self.assertEqual(len(self.client.get(
            "/api/v1/stories").json()["stories"]), before)

    def test_sqlite_failure_in_lore_rolls_back_entire_package(self):
        narrative = self.app.state.narrative
        hub = StoryHubService(narrative)
        with narrative.store._conn() as db:
            db.execute("""CREATE TRIGGER fail_hub_lore
                BEFORE INSERT ON lorebook_entries
                BEGIN SELECT RAISE(ABORT, 'forced test failure'); END""")
            before = db.execute("SELECT count(*) FROM stories").fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            hub.install("ultima-luna", InstallStoryPack())
        with narrative.store._conn() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM stories").fetchone()[0],
                             before)
            self.assertEqual(db.execute("SELECT count(*) FROM creator_blueprints")
                             .fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM creator_characters")
                             .fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM lorebook_entries")
                             .fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
