"""Neural matte reconstruction: hair alpha, fail-closed masks, size limits."""
import io
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.sprite_cutout import transparent_sprite_from_matte


def data(rgb_background=(45, 60, 105), shift=0, mask_size=None,
         inversion=False, blank=False):
    canvas = Image.new("RGB", (256, 256), rgb_background)
    ImageDraw.Draw(canvas).ellipse((70, 22, 184, 234), fill=(191, 48, 120))
    alpha = Image.new("L", mask_size or (256, 256),
                      color=255 if inversion else 0)
    if not blank:
        ImageDraw.Draw(alpha).ellipse(
            (70 + shift, 22, 184 + shift, 234),
            fill=0 if inversion else 255)
        if not inversion and not shift:
            alpha.putpixel((75, 100), 92)  # soft hair/edge-like matte pixel
    first, second = io.BytesIO(), io.BytesIO()
    canvas.save(first, "PNG")
    alpha.save(second, "PNG")
    return first.getvalue(), second.getvalue()


class NeuralMatteTests(unittest.TestCase):
    def test_non_green_background_is_accepted_with_mask(self):
        image, mask = data()
        output, report = transparent_sprite_from_matte(
            image, mask, "neural_rmbg2")
        self.assertEqual(report["method"], "neural_rmbg")
        with Image.open(io.BytesIO(output)) as frame:
            self.assertEqual(frame.mode, "RGBA")
            self.assertEqual(frame.getpixel((0, 0))[3], 0)
            self.assertEqual(frame.getpixel((128, 128))[3], 255)
            self.assertEqual(frame.getpixel((75, 100))[3], 92)
        self.assertTrue(report["requires_author_review"])

    def test_birefnet_portrait_uses_same_validation(self):
        img, matte = data(rgb_background=(204, 213, 207))
        _, report = transparent_sprite_from_matte(
            img, matte, "neural_birefnet_portrait")
        self.assertEqual(report["method"], "neural_birefnet")

    def test_missing_wrong_sized_and_non_image_masks_are_rejected(self):
        original, mat = data()
        with self.assertRaisesRegex(ValueError, "Invalid image or neural mask"):
            transparent_sprite_from_matte(original, b"wrong", "neural_rmbg2")
        with self.assertRaisesRegex(ValueError, "does not match"):
            transparent_sprite_from_matte(
                original, data(mask_size=(128, 128))[1], "neural_rmbg2")
        with self.assertRaisesRegex(ValueError, "limit"):
            transparent_sprite_from_matte(original, b"X" * (13 * 1024 * 1024),
                                          "neural_rmbg2")

    def test_inverted_and_empty_masks_fail_closed(self):
        for img, mask in [data(inversion=True), data(blank=True), data(shift=145)]:
            with self.assertRaisesRegex(ValueError, "Unreliable"):
                transparent_sprite_from_matte(
                    img, mask, "neural_rmbg2")

    def test_unknown_mode_rejected(self):
        original, mask = data()
        with self.assertRaisesRegex(ValueError, "Unknown neural background removal engine"):
            transparent_sprite_from_matte(original, mask, "any_unknown")


if __name__ == "__main__":
    unittest.main()
