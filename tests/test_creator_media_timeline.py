"""Historical editorial image, caption, cover, and deletion behavior."""
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


def artwork():
    output = io.BytesIO()
    Image.new("RGB", (40, 40), (12, 40, 160)).save(output, "PNG")
    return output.getvalue()


class CreatorMediaTimelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-editorial-timeline-")
        self.app = create_app(Path(self.temp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "Historia temporal", "premise": "Una viajera explora un castillo.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.narrative = self.app.state.narrative
        self.media = self.app.state.creator_media

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def upload(self, kind, label="Retrato", caption="Castillo antiguo nocturno"):
        response = self.client.post(
            f"/api/v1/stories/{self.story}/creator/assets",
            data={"kind": kind, "label": label, "caption": caption},
            files={"file": ("art.png", artwork(), "image/png")},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def turn(self):
        return self.narrative.append(
            self.story, str(uuid.uuid4()), "do", "Exploro el reino",
            "Se acerca un extraño viajero.", "fixture",
        )

    def branch(self, cutoff=None, source=None):
        response = self.client.post(
            f"/api/v1/stories/{source or self.story}/fork",
            json={"until_turn_id": cutoff},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def live(self, story):
        response = self.client.get(f"/api/v1/stories/{story}/creator/assets")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["assets"]

    def history(self, story, turn):
        with self.app.state.store._conn() as db:
            return db.execute(
                "SELECT * FROM creator_media_turn_snapshots "
                "WHERE story_id=? AND turn_id=?", (story, turn)
            ).fetchone()

    def test_old_branch_restores_caption_but_not_future_cover_or_upload(self):
        old = self.upload("background", "Patio", "Patio del castillo abandonado")
        first = self.turn()
        rename = self.client.put(
            f"/api/v1/stories/{self.story}/creator/assets/{old['id']}",
            json={"label": "Secreto futuro", "caption": "Entrada oculta bajo el castillo"},
        )
        self.assertEqual(rename.status_code, 200, rename.text)
        future = self.upload("cover", "La identidad secreta", "Revelación del enemigo final")
        self.assertEqual(self.client.put(
            f"/api/v1/stories/{self.story}/creator/cover",
            json={"asset_id": future["id"]}).status_code, 200)
        second = self.turn()
        early = self.branch(first["id"])
        assets = self.live(early)
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0]["label"], "Patio")
        self.assertEqual(assets[0]["caption"], "Patio del castillo abandonado")
        self.assertNotEqual(assets[0]["id"], old["id"])
        self.assertIsNone(self.narrative.get_story(early)["cover_asset_id"])
        self.assertEqual(self.client.get(assets[0]["url"]).status_code, 200)
        late = self.branch(second["id"])
        self.assertEqual(len(self.live(late)), 2)
        self.assertIsNotNone(self.narrative.get_story(late)["cover_asset_id"])
        full = self.branch()
        turns = self.narrative.turns(full)
        early_rows = json.loads(self.history(full, turns[0]["id"])["assets_json"])
        late_rows = json.loads(self.history(full, turns[1]["id"])["assets_json"])
        self.assertEqual(len(early_rows), 1)
        self.assertEqual(len(late_rows), 2)
        self.assertEqual(early_rows[0]["id"], next(
            item["id"] for item in late_rows if item["kind"] == "background"))

    def test_deleted_asset_stays_on_disk_for_historical_recovery(self):
        item = self.upload("cover")
        self.assertEqual(self.client.put(
            f"/api/v1/stories/{self.story}/creator/cover",
            json={"asset_id": item["id"]}).status_code, 200)
        original_turn = self.turn()
        path = self.media._path(self.story, item["id"], "cover")
        self.assertEqual(self.client.delete(
            f"/api/v1/stories/{self.story}/creator/assets/{item['id']}"
        ).status_code, 204)
        self.assertEqual(self.live(self.story), [])
        self.assertEqual(self.client.get(item["url"]).status_code, 404)
        self.assertTrue(path.is_file())
        self.turn()
        early = self.branch(original_turn["id"])
        self.assertEqual(len(self.live(early)), 1)
        self.assertIsNotNone(self.narrative.get_story(early)["cover_asset_id"])
        self.assertEqual(self.client.get(self.live(early)[0]["url"]).status_code, 200)
        full = self.branch()
        self.assertEqual(self.live(full), [])
        self.assertIsNone(self.narrative.get_story(full)["cover_asset_id"])
        # Full branches retain old snapshots and bytes for their own future forks.
        oldest = self.narrative.turns(full)[0]
        nested = self.branch(oldest["id"], source=full)
        self.assertEqual(len(self.live(nested)), 1)

    def test_legacy_missing_checkpoint_fails_closed(self):
        first = self.turn()
        with self.app.state.store._conn() as db:
            db.execute("DELETE FROM creator_media_turn_snapshots WHERE turn_id=?",
                       (first["id"],))
        self.upload("background", "Futuro", "Castillo de la revelación")
        self.assertEqual(self.live(self.branch(first["id"])), [])

    def test_snapshot_failure_rolls_back_turn(self):
        self.upload("background")
        with patch.object(self.media, "snapshot_turn_in_transaction",
                          side_effect=RuntimeError("injected editorial error")):
            with self.assertRaisesRegex(RuntimeError, "injected editorial error"):
                self.turn()
        with self.app.state.store._conn() as db:
            for table in ("story_turns", "creator_media_turn_snapshots",
                          "creator_turn_snapshots", "world_turn_snapshots",
                          "lorebook_turn_snapshots"):
                self.assertEqual(db.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE story_id=?",
                    (self.story,)).fetchone()[0], 0, table)

    def test_missing_historical_file_does_not_publish_branch(self):
        item = self.upload("background")
        first = self.turn()
        self.client.delete(f"/api/v1/stories/{self.story}/creator/assets/{item['id']}")
        self.media._path(self.story, item["id"], "background").unlink()
        before = len(self.client.get("/api/v1/stories").json()["stories"])
        result = self.client.post(
            f"/api/v1/stories/{self.story}/fork",
            json={"until_turn_id": first["id"]},
        )
        self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual(len(self.client.get("/api/v1/stories").json()["stories"]), before)


if __name__ == "__main__":
    unittest.main()
