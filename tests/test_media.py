"""Scene media and protagonist persistence — real Pillow decoding, no AI image synthesis."""
import io
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class StoryMediaTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.root.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        self.story = self.client.post("/api/v1/stories", json={
            "title": "La torre encantada",
            "premise": "Una maga custodia una torre en un valle rodeado de montañas.",
            "protagonist_name": "Joel",
        }).json()

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.root.cleanup()

    def test_protagonist_and_image_persist(self):
        ident = self.story["id"]
        self.assertEqual(self.story["protagonist_name"], "Joel")
        self.assertIsNone(self.story["scene_image_url"])
        updated = self.client.patch("/api/v1/stories/" + ident + "/protagonist",
                                    json={"name": "Kai"})
        self.assertEqual(updated.status_code, 200, updated.text)
        img = Image.new("RGB", (80, 65), (100, 80, 130))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        upload = self.client.post("/api/v1/stories/" + ident + "/scene-image",
            files={"file": ("art.png", buffer.getvalue(), "image/png")})
        self.assertEqual(upload.status_code, 200, upload.text)
        self.assertTrue(upload.json()["scene_image_url"].endswith("/scene-image"))
        stored = self.client.get("/api/v1/stories/" + ident + "/scene-image")
        self.assertEqual(stored.status_code, 200, stored.text)
        self.assertEqual(stored.headers["content-type"], "image/webp")
        with Image.open(io.BytesIO(stored.content)) as result:
            self.assertEqual(result.size, (80, 65))
            self.assertEqual(result.format, "WEBP")
        self.assertEqual(self.client.get("/api/v1/stories/" + ident).json()["protagonist_name"], "Kai")
        self.assertEqual(len(self.client.get("/api/v1/stories").json()["stories"]), 1)

        second = create_app(Path(self.root.name))
        with TestClient(second) as second_client:
            saved = second_client.get("/api/v1/stories/" + ident).json()
            self.assertEqual(saved["protagonist_name"], "Kai")
            self.assertTrue(saved["scene_image_url"])

    def test_rejects_html_and_excessive_upload(self):
        ident = self.story["id"]
        bad = self.client.post("/api/v1/stories/" + ident + "/scene-image",
            files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")})
        self.assertEqual(bad.status_code, 415)
        wrong = self.client.post("/api/v1/stories/" + ident + "/scene-image",
            files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")})
        self.assertEqual(wrong.status_code, 422)
        too_big = self.client.post("/api/v1/stories/" + ident + "/scene-image",
            files={"file": ("huge.jpg", b"f" * (12 * 1024 * 1024 + 1), "image/jpeg")})
        self.assertEqual(too_big.status_code, 413)
        self.assertIsNone(self.client.get("/api/v1/stories/" + ident).json()["scene_image_url"])


if __name__ == "__main__":
    unittest.main()
