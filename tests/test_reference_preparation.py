"""Full-portrait letterboxing for RGB and transparent character references."""
import io
import sys
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.reference_preparation import identity_reference_png


def png(size=(64, 128), transparent=True):
    art = Image.new("RGBA", size, (0, 0, 0, 0) if transparent
                    else (234, 65, 140, 255))
    ImageDraw.Draw(art).rectangle((10, 20, 54, 118), fill=(216, 35, 90, 255))
    out = io.BytesIO()
    art.save(out, "PNG")
    return out.getvalue()


class ReferencePreparationTests(unittest.TestCase):
    def test_transparent_portrait_keeps_full_body_without_cropping(self):
        result = identity_reference_png(png(), 256, 256)
        with Image.open(io.BytesIO(result)) as im:
            self.assertEqual(im.size, (256, 256))
            self.assertEqual(im.mode, "RGB")
            self.assertEqual(im.getpixel((0, 0)), (238, 238, 238))
            self.assertEqual(im.getpixel((128, 128)), (216, 35, 90))
            self.assertEqual(im.getpixel((250, 128)), (238, 238, 238))

    def test_opaque_and_invalid_references(self):
        result = identity_reference_png(png(transparent=False), 256, 256)
        self.assertGreater(len(result), 100)
        for raw in (b"", b"not-a-real-image"):
            with self.assertRaises(ValueError):
                identity_reference_png(raw, 256, 256)

    def test_tiny_images_are_not_accepted(self):
        source = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(source, "PNG")
        with self.assertRaisesRegex(ValueError, "Resolución"):
            identity_reference_png(source.getvalue(), 256, 256)


if __name__ == "__main__":
    unittest.main()
