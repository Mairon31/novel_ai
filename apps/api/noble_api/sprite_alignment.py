"""Alpha-mask silhouette continuity review for a five-expression sprite set.

This checks only coarse composition (relative bounding box, center and area).
It is not face recognition, biometric identity matching or semantic anatomy.
Warnings require explicit author acknowledgement before publishing.
"""
from __future__ import annotations

import io
import math
from PIL import Image

EXPRESSION_NAMES = ("neutral", "joy", "anger", "sadness", "surprise")


def silhouette_geometry(image: Image.Image) -> dict:
    if image.mode != "RGBA":
        raise ValueError("Silhouette must be RGBA")
    alpha = image.getchannel("A")
    visible = alpha.point(lambda a: 255 if a >= 128 else 0)
    bounds = visible.getbbox()
    if bounds is None:
        raise ValueError("Sprite has no visible silhouette")
    width, height = image.size
    left, top, right, bottom = bounds
    return {
        "bbox": [round(left / width, 5), round(top / height, 5),
                 round(right / width, 5), round(bottom / height, 5)],
        "center": [round((left + right) / (2 * width), 5),
                   round((top + bottom) / (2 * height), 5)],
        "size": [round((right - left) / width, 5),
                 round((bottom - top) / height, 5)],
    }


def geometry_from_png(raw: bytes) -> dict:
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        return silhouette_geometry(im.convert("RGBA"))


def alignment_warnings(geometry: dict[str, dict]) -> list[str]:
    """Compare expressions to neutral (or first available slot) conservatively.

    Coarse silhouettes can change with expression/arms, so warnings never
    imply inconsistent face or fraud. They gate only *unacknowledged* approval.
    """
    origin = next((key for key in EXPRESSION_NAMES if key in geometry), None)
    if origin is None:
        return []
    base = geometry[origin]
    result = []
    for name in EXPRESSION_NAMES:
        if name == origin or name not in geometry:
            continue
        item = geometry[name]
        try:
            dx = abs(item["center"][0] - base["center"][0])
            dy = abs(item["center"][1] - base["center"][1])
            bw, bh = base["size"]
            iw, ih = item["size"]
            if any(not math.isfinite(v) or v <= 0 for v in (bw, bh, iw, ih)):
                raise ValueError("Degenerate geometry")
            if dx > 0.15 or dy > 0.15:
                result.append(name + ": silhouette position differs significantly")
            if max(iw / bw, bw / iw, ih / bh, bh / ih) > 1.65:
                result.append(name + ": escala de silueta muy distinta")
        except (TypeError, KeyError, ValueError, ZeroDivisionError):
            result.append(name + ": geometry could not be compared")
    return result
