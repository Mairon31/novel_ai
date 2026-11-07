"""Local silhouette geometry and author-review warning thresholds."""
import io
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.sprite_alignment import (
    alignment_warnings, geometry_from_png, silhouette_geometry)


def ellipse(offset=0, width=100, height=190):
    art = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(art).ellipse(
        (128 - width // 2 + offset, 128 - height // 2,
         128 + width // 2 + offset, 128 + height // 2),
        fill=(100, 70, 190, 255))
    return art


class AlignmentQualityTests(unittest.TestCase):
    def test_stable_silhouettes_produce_no_warnings(self):
        baseline = silhouette_geometry(ellipse())
        nearly = silhouette_geometry(ellipse(offset=5))
        self.assertEqual(alignment_warnings(
            {"neutral": baseline, "joy": nearly, "anger": nearly}), [])

    def test_center_displacement_and_scale_drift_are_reported(self):
        base = silhouette_geometry(ellipse())
        shifted = silhouette_geometry(ellipse(offset=52))
        small = silhouette_geometry(ellipse(width=45, height=85))
        warnings = alignment_warnings({"neutral": base, "joy": shifted,
                                       "anger": small})
        self.assertTrue(any("joy: posición" in v for v in warnings), warnings)
        self.assertTrue(any("anger: escala" in v for v in warnings), warnings)

    def test_empty_or_missing_geometry_is_safe(self):
        self.assertEqual(alignment_warnings({}), [])
        with self.assertRaisesRegex(ValueError, "visible silhouette"):
            silhouette_geometry(Image.new("RGBA", (256, 256), (0, 0, 0, 0)))

    def test_png_round_trip_preserves_ratios(self):
        art = ellipse()
        buf = io.BytesIO()
        art.save(buf, "PNG")
        self.assertEqual(geometry_from_png(buf.getvalue()),
                         silhouette_geometry(art))


if __name__ == "__main__":
    unittest.main()
