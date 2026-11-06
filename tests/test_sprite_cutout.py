"""Deterministic alpha-extraction tests, no provider or GPU required."""
import io
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.sprite_cutout import transparent_sprite


def sample(mode="green", touch=False):
    art = Image.new("RGB", (256, 256),
                    (4, 245, 8) if mode == "green" else (50, 68, 92))
    draw = ImageDraw.Draw(art)
    draw.ellipse((75, 26, 182, 226) if not touch else (75, 0, 182, 226),
                 fill=(181, 80, 70))
    buffer = io.BytesIO()
    art.save(buffer, "PNG")
    return buffer.getvalue()


class ChromaCutoutTests(unittest.TestCase):
    def test_green_corner_background_only_is_removed(self):
        output, review = transparent_sprite(sample())
        self.assertEqual(review["method"], "border_chroma_key")
        self.assertTrue(review["requires_author_review"])
        with Image.open(io.BytesIO(output)) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertGreater(image.getpixel((128, 128))[3], 240)
            self.assertLess(review["coverage"], 0.5)

    def test_uncertain_or_non_green_background_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Fondo no uniforme"):
            transparent_sprite(sample(mode="gray"))

    def test_character_touching_frame_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "recorte no es fiable"):
            transparent_sprite(sample(touch=True))

    def test_pretransparent_valid_input_is_preserved(self):
        artwork = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        ImageDraw.Draw(artwork).ellipse((80, 20, 180, 240),
                                        fill=(210, 90, 170, 255))
        buf = io.BytesIO()
        artwork.save(buf, "PNG")
        result, details = transparent_sprite(buf.getvalue())
        self.assertEqual(details["method"], "alpha_original")
        self.assertEqual(Image.open(io.BytesIO(result)).getpixel((0, 0))[3], 0)

    def test_opaque_empty_chroma_is_not_accepted(self):
        blank = Image.new("RGB", (256, 256), (4, 245, 8))
        buffer = io.BytesIO()
        blank.save(buffer, "PNG")
        with self.assertRaisesRegex(ValueError, "recorte no es fiable"):
            transparent_sprite(buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
