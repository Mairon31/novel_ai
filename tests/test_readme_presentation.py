"""Validate the public README presentation and genuine UI screenshots."""
from __future__ import annotations
import unittest
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]


class PublicReadmeTests(unittest.TestCase):
    def test_brand_gallery_badges_architecture_and_collaboration(self):
        readme=(ROOT/"README.md").read_text(encoding="utf-8")
        needles=("Noble AI", "github.com/Mairon31/novel_ai",
                 "actions/workflows/p0-docs.yml/badge.svg",
                 "docs/assets/noble-banner.svg", "docs/assets/screenshots/",
                 "CONTRIBUTING.md", "Contribuir", "estrella", "app-first")
        for item in needles:
            self.assertIn(item.casefold(),readme.casefold())
        self.assertNotIn("## Próximo resultado comprobable",readme)
        self.assertNotIn("## Roadmap",readme)
        self.assertNotIn("Estado: P1.",readme)
        self.assertTrue((ROOT/"CONTRIBUTING.md").is_file())
        self.assertTrue((ROOT/"docs/assets/noble-banner.svg").is_file())
        self.assertGreaterEqual(readme.count(chr(96)*3+"mermaid"),2)

    def test_actual_screenshots_are_present_and_small(self):
        gallery=ROOT/"docs/assets/screenshots"
        images=("reader-desktop.webp","model-hub.webp","gallery.webp",
                "workers.webp","reader-mobile.webp")
        readme=(ROOT/"README.md").read_text(encoding="utf-8")
        for name in images:
            with self.subTest(name=name):
                path=gallery/name
                self.assertTrue(path.is_file(),str(path))
                self.assertLess(path.stat().st_size,240*1024)
                with Image.open(path) as photo:
                    self.assertEqual(photo.format,"WEBP")
                    self.assertGreaterEqual(photo.width,350)
                    self.assertGreaterEqual(photo.height,240)
                self.assertIn(name,readme)


if __name__=="__main__":
    unittest.main()
