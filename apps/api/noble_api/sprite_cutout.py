"""Conservative local alpha extraction for explicitly approved sprite drafts.

ComfyUI's core SaveImage usually produces opaque RGB art. We request a vivid
green background and remove only green pixels connected to the *outside*.
Poorly keyed or nonisolated generations are rejected, never silently imported.
This is a review aid, not semantic segmentation or identity verification.
"""
from __future__ import annotations

from collections import deque
import io

from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

from .creator_media import MAX_MEDIA_BYTES, MAX_MEDIA_PIXELS


def _green(rgb: tuple[int, int, int]) -> bool:
    red, green, blue = rgb
    return green >= 96 and green - red >= 48 and green - blue >= 48


def transparent_sprite(data: bytes) -> tuple[bytes, dict]:
    """Decode, remove only border-connected chroma, and quality-gate a preview."""
    if not 0 < len(data) <= MAX_MEDIA_BYTES:
        raise ValueError("Render exceeds the 12 MiB limit")
    try:
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("ComfyUI returned an unsupported image format")
            width, height = original.size
            if min(width, height) < 128 or width * height > MAX_MEDIA_PIXELS:
                raise ValueError("AI sprite size is out of bounds")
            original.load()
            photo = ImageOps.exif_transpose(original).convert("RGBA")
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("ComfyUI returned an invalid image") from exc

    width, height = photo.size
    alpha = photo.getchannel("A")
    amin, amax = alpha.getextrema()
    if amin < 255:
        if amax == 0:
            raise ValueError("Generated sprite is completely transparent")
        method = "alpha_original"
    else:
        rgb = photo.convert("RGB")
        values = list(rgb.getdata())
        border = [index for y in range(height) for index in (
            y * width, y * width + width - 1)]
        border.extend(range(width))
        border.extend(range((height - 1) * width, height * width))
        green_ratio = sum(_green(values[index]) for index in border) / len(border)
        if green_ratio < 0.9:
            raise ValueError(
                "Nonuniform background: generate an isolated character on solid green")
        # Check *before* MinFilter/GaussianBlur: filtering can erase a
        # one-pixel contact and falsely make a clipped figure appear valid.
        if green_ratio < 1.0:
            raise ValueError(
                "Unreliable cutout: silhouette touches the canvas edge")
        visited = bytearray(width * height)
        background = bytearray(width * height)
        queue = deque()
        for pos in border:
            if not visited[pos] and _green(values[pos]):
                visited[pos] = 1
                background[pos] = 1
                queue.append(pos)
        while queue:
            pos = queue.popleft()
            x, y = pos % width, pos // width
            neighbors = []
            if x:
                neighbors.append(pos - 1)
            if x + 1 < width:
                neighbors.append(pos + 1)
            if y:
                neighbors.append(pos - width)
            if y + 1 < height:
                neighbors.append(pos + width)
            for next_pos in neighbors:
                if not visited[next_pos]:
                    visited[next_pos] = 1
                    if _green(values[next_pos]):
                        background[next_pos] = 1
                        queue.append(next_pos)
        foreground = bytes(0 if bg else 255 for bg in background)
        alpha = Image.frombytes("L", (width, height), foreground)
        # Contract the matte slightly, then softly antialias edge halos.
        alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(
            ImageFilter.GaussianBlur(0.6))
        photo.putalpha(alpha)
        method = "border_chroma_key"

    a = photo.getchannel("A")
    coverage = sum(1 for value in a.getdata() if value >= 192) / (width * height)
    border_alpha = ([a.getpixel((x, 0)) for x in range(width)] +
                    [a.getpixel((x, height - 1)) for x in range(width)] +
                    [a.getpixel((0, y)) for y in range(height)] +
                    [a.getpixel((width - 1, y)) for y in range(height)])
    if not 0.04 <= coverage <= 0.82 or (
            sum(value > 32 for value in border_alpha) / len(border_alpha) > 0.06):
        raise ValueError(
            "Unreliable cutout: character must be fully visible and separated from the edge")
    out = io.BytesIO()
    photo.save(out, "PNG", optimize=True)
    if out.tell() > MAX_MEDIA_BYTES:
        raise ValueError("Sprite PNG demasiado grande")
    return out.getvalue(), {
        "method": method, "coverage": round(coverage, 4),
        "requires_author_review": True,
    }


def transparent_sprite_from_matte(
        image_bytes: bytes, mask_bytes: bytes, mode: str) -> tuple[bytes, dict]:
    """Build local PNG RGBA from the *same job*'s processed IMAGE and MASK.

    ComfyUI's SaveImage may discard RGB(A) alpha depending on node/version.
    The independent MaskToImage output is authoritative; malformed, empty,
    reversed, clipped or implausibly large masks are rejected.
    """
    from .comfy_matting import MODELS

    if mode not in MODELS:
        raise ValueError("Motor neuronal desconocido")
    if (not 0 < len(image_bytes) <= MAX_MEDIA_BYTES or
            not 0 < len(mask_bytes) <= MAX_MEDIA_BYTES):
        raise ValueError("Image or mask exceeds the 12 MiB limit")
    try:
        with Image.open(io.BytesIO(image_bytes)) as original, Image.open(
                io.BytesIO(mask_bytes)) as mask_source:
            if original.format not in {"PNG", "JPEG", "WEBP"} or mask_source.format != "PNG":
                raise ValueError("ComfyUI image/mask has an unsupported format")
            width, height = original.size
            if (min(width, height) < 128 or
                    width * height > MAX_MEDIA_PIXELS or
                    mask_source.size != original.size):
                raise ValueError("Neural mask does not match the image")
            original.load()
            mask_source.load()
            photo = ImageOps.exif_transpose(original).convert("RGB")
            matte = mask_source.convert("L")
            if photo.size != matte.size:
                raise ValueError("Mask and image have different orientations")
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("Invalid image or neural mask") from exc

    histogram = matte.histogram()
    coverage = sum(histogram[192:]) / (width * height)
    # A perimeter mask is a strong signal of a background or reversed-mask
    # failure. Check *before* saving; never smooth away a cut-off subject.
    border = (
        [matte.getpixel((x, 0)) for x in range(width)] +
        [matte.getpixel((x, height - 1)) for x in range(width)] +
        [matte.getpixel((0, y)) for y in range(height)] +
        [matte.getpixel((width - 1, y)) for y in range(height)]
    )
    edge_ratio = sum(value > 32 for value in border) / len(border)
    if (not 0.04 <= coverage <= 0.82 or edge_ratio > 0.06):
        raise ValueError(
            "Unreliable neural mask: incorrect background, silhouette, or edges")
    result = photo.convert("RGBA")
    result.putalpha(matte)
    out = io.BytesIO()
    result.save(out, "PNG", optimize=True)
    if out.tell() > MAX_MEDIA_BYTES:
        raise ValueError("PNG with neural mask is too large")
    return out.getvalue(), {
        "method": MODELS[mode]["method"],
        "coverage": round(coverage, 4),
        "requires_author_review": True,
    }
