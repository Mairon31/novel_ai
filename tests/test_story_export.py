"""Portable illustrated export: escaped HTML, historical art and branch isolation."""
from __future__ import annotations

import io
import sys
import zipfile
import xml.etree.ElementTree as ET
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


def png(color):
    picture = Image.new("RGB", (48, 48), color)
    with io.BytesIO() as buf:
        picture.save(buf, "PNG")
        return buf.getvalue()


class StoryExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-export-")
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "El <mundo> & la torre",
            "premise": "El mapa debe permanecer en un lugar mágico y secreto.",
            "protagonist_name": "Aira",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.url = f"/api/v1/stories/{self.story}/export.html"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def turn(self, text="Me acerco", reply="La protagonista avanza.", story=None):
        return self.app.state.narrative.append(
            story or self.story, str(uuid.uuid4()), "do", text, reply, "fixture",
        )

    def scene_image(self, color):
        reply = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("scene.png", png(color), "image/png")},
        )
        self.assertEqual(reply.status_code, 200, reply.text)
        return reply.json()

    def test_escaped_offline_html_contains_all_committed_turns_and_not_private_plot(self):
        self.client.put(f"/api/v1/stories/{self.story}/creator", json={
            "ai_plot": "SECRETO DEL AUTOR: la luna es artificial.",
            "guidelines": "SECRETO DE CONFIGURACIÓN INTERNA",
        })
        self.turn('Digo <script>alert("X")</script> & continuar',
                  "La bibliotecaria sonríe al ver el libro & los símbolos.")
        self.turn("Leo la inscripción", "Una puerta se abre lentamente.")
        reply = self.client.get(self.url)
        self.assertEqual(reply.status_code, 200, reply.text[:200])
        self.assertIn("attachment", reply.headers["content-disposition"])
        self.assertIn("no-store", reply.headers["cache-control"])
        self.assertEqual(reply.headers["x-content-type-options"], "nosniff")
        html = reply.content.decode("utf-8")
        self.assertTrue(html.startswith("<!doctype html>"))
        self.assertIn("El &lt;mundo&gt; &amp; la torre", html)
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;alert(&quot;X&quot;)&lt;/script&gt;", html)
        self.assertIn("Una puerta se abre lentamente", html)
        self.assertEqual(html.count("<section>"), 2)
        self.assertNotIn("SECRETO DEL AUTOR", html)
        self.assertNotIn("SECRETO DE CONFIGURACIÓN", html)
        self.assertNotIn("http://", html)
        self.assertNotIn("https://", html)

    def test_cover_and_historical_selected_gallery_export_embedded_and_offline(self):
        cover = self.client.post(f"/api/v1/stories/{self.story}/creator/assets", data={
            "kind": "cover", "label": "Libro", "caption": "El libro sobre el altar",
        }, files={"file": ("cover.png", png((220, 80, 90)), "image/png")})
        self.assertEqual(cover.status_code, 201, cover.text)
        self.assertEqual(self.client.put(
            f"/api/v1/stories/{self.story}/creator/cover",
            json={"asset_id": cover.json()["id"]}).status_code, 200)
        self.scene_image((90, 10, 90))
        first = self.turn("Investigo el templo")
        self.scene_image((10, 190, 80))
        self.turn("Entro a un bosque")
        page = self.client.get(self.url).text
        self.assertEqual(page.count("data:image/webp;base64,"), 3)
        self.assertEqual(page.count("<section>"), 2)
        self.assertIn('alt="Portada de la historia"', page)
        self.assertIn('alt="Ilustración de la escena 1"', page)
        self.assertIn('alt="Ilustración de la escena 2"', page)
        # Forking at first turn cannot inherit art or text from later scenes.
        fork = self.client.post(f"/api/v1/stories/{self.story}/fork",
                                json={"until_turn_id": first["id"]})
        self.assertEqual(fork.status_code, 201, fork.text)
        page = self.client.get(f"/api/v1/stories/{fork.json()['id']}/export.html").text
        self.assertEqual(page.count("<section>"), 1)
        self.assertEqual(page.count("data:image/webp;base64,"), 2)
        self.assertNotIn("Entro a un bosque", page)
        self.assertIn("Rama independiente", page)

    def test_epub3_is_valid_portable_archive_with_cover_and_two_scenes(self):
        cover = self.client.post(f"/api/v1/stories/{self.story}/creator/assets", data={
            "kind": "cover", "label": "Libro", "caption": "Libro sobre altar",
        }, files={"file": ("cover.png", png((220, 40, 50)), "image/png")})
        self.assertEqual(cover.status_code, 201, cover.text)
        self.client.put(f"/api/v1/stories/{self.story}/creator/cover",
                        json={"asset_id": cover.json()["id"]})
        self.scene_image((20, 60, 210))
        self.turn("Miro el libro <peligroso>", "El gran palacio se ilumina.")
        self.scene_image((40, 200, 120))
        self.turn("Cruzo al bosque", "La guardiana se aleja.")

        reply = self.client.get(f"/api/v1/stories/{self.story}/export.epub")
        self.assertEqual(reply.status_code, 200, reply.text[:100] if reply.status_code != 200 else "")
        self.assertEqual(reply.headers["content-type"], "application/epub+zip")
        self.assertIn("attachment", reply.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(reply.content)) as archive:
            self.assertEqual(archive.namelist()[0], "mimetype")
            self.assertEqual(archive.getinfo("mimetype").compress_type,
                             zipfile.ZIP_STORED)
            self.assertEqual(archive.read("mimetype"), b"application/epub+zip")
            images = [name for name in archive.namelist()
                      if name.startswith("OEBPS/images/")]
            self.assertEqual(len(images), 3)
            for name in images:
                data = archive.read(name)
                self.assertEqual(data[:4], b"RIFF")
                self.assertEqual(data[8:12], b"WEBP")
            self.assertEqual(len(archive.read("OEBPS/nav.xhtml")) > 100, True)
            opf = ET.fromstring(archive.read("OEBPS/content.opf"))
            xhtml = ET.fromstring(archive.read("OEBPS/chapter.xhtml"))
            self.assertTrue(opf.tag.endswith("package"))
            self.assertTrue(xhtml.tag.endswith("html"))
            self.assertIn("El <mundo> & la torre",
                          "".join(xhtml.itertext()))
            text = archive.read("OEBPS/chapter.xhtml").decode("utf-8")
            self.assertIn("Miro el libro &lt;peligroso&gt;", text)
            self.assertNotIn("<script>", text)
            self.assertIn("La guardiana se aleja.", text)
            nav = archive.read("OEBPS/nav.xhtml")
            self.assertIn(b"chapter-1", nav)
            self.assertIn(b"chapter-2", nav)

    def test_epub_uses_independent_branch_and_omits_future_scene(self):
        self.scene_image((140, 20, 160))
        first = self.turn("Encuentro un mapa de jade")
        self.scene_image((10, 230, 30))
        self.turn("Se revela el reino futuro")
        branch = self.client.post(f"/api/v1/stories/{self.story}/fork",
                                  json={"until_turn_id": first["id"]})
        self.assertEqual(branch.status_code, 201, branch.text)
        exported = self.client.get(
            f"/api/v1/stories/{branch.json()['id']}/export.epub")
        self.assertEqual(exported.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            chapter = archive.read("OEBPS/chapter.xhtml").decode("utf-8")
            self.assertIn("Encuentro un mapa de jade", chapter)
            self.assertNotIn("reino futuro", chapter)
            self.assertIn("Rama independiente", chapter)
            self.assertEqual(len([f for f in archive.namelist()
                                  if f.startswith("OEBPS/images/")]), 1)

    def test_epub_unknown_story_is_404(self):
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{uuid.uuid4()}/export.epub").status_code, 404)

    def test_unknown_story_and_invalid_bytes_not_embedded(self):
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{uuid.uuid4()}/export.html").status_code, 404)
        gallery = self.scene_image((220, 120, 20))
        self.turn()
        with self.app.state.store._conn() as db:
            ident = db.execute(
                "SELECT id FROM visual_assets WHERE story_id=?", (self.story,)
            ).fetchone()["id"]
        path = self.app.state.visual._asset_path(self.story, ident)
        path.write_bytes(b"fake-webp-untrusted")
        page = self.client.get(self.url).text
        self.assertNotIn("data:image/webp;base64,", page)
        self.assertEqual(page.count("<section>"), 1)


if __name__ == "__main__":
    unittest.main()
