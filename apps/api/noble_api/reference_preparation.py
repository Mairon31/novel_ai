"""Prepare owned character reference images without cropping faces or outlines."""
from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError


def identity_reference_png(raw: bytes, width: int, height: int) -> bytes:
    """Letterbox (never center-crop) with a neutral RGB background for CLIP Vision."""
    if not 0 < len(raw) <= 12 * 1024 * 1024:
        raise ValueError("Referencia visual superior a 12 MiB")
    try:
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in {"PNG", "WEBP", "JPEG"}:
                raise ValueError("Unsupported reference format")
            if original.width < 8 or original.height < 8 or (
                    original.width * original.height > 20_000_000):
                raise ValueError("Invalid reference resolution")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGBA")
            contained = ImageOps.contain(image, (width, height),
                                         Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (width, height), (238, 238, 238, 255))
            canvas.alpha_composite(
                contained, ((width - contained.width) // 2,
                            (height - contained.height) // 2))
            final = io.BytesIO()
            canvas.convert("RGB").save(final, "PNG")
            return final.getvalue()
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("Could not prepare visual reference") from exc
