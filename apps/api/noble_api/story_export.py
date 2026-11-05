"""Portable self-contained HTML export of a single story/branch.

The export reads committed SQLite turns and immutable per-turn art snapshots.
It never walks the source directory or exposes the creator's private prompt
instructions. Embedded images are bounded and independently validated through
the existing UUID/path checks; no network resources are needed to read it.
"""
from __future__ import annotations

import base64
import html
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.responses import Response

MAX_INLINE_IMAGES = 48
MAX_IMAGE_BYTES = 6 * 1024 * 1024
MAX_TOTAL_BYTES = 28 * 1024 * 1024

STYLES = """
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: #11131b; color: #e5e7ef; line-height: 1.75; }
main { max-width: 770px; margin: auto; padding: 3rem 1.5rem 5rem; }
header { text-align: center; margin-bottom: 4rem; }
h1 { font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.15; margin: 1rem 0; }
h2 { font-size: 1.3rem; margin: 3rem 0 1.2rem; }
figure { margin: 1.8rem 0; }
img { max-width: 100%; height: auto; border-radius: 12px; }
.cover img { max-height: 480px; object-fit: contain; }
small, .subtle, figcaption { color: #acb0bf; }
section { padding-bottom: 2rem; border-bottom: 1px solid #343743; }
.action { padding: 0.9rem 1.1rem; border-left: 3px solid #c4b5fd;
 background: #1b1e29; white-space: pre-wrap; overflow-wrap: anywhere; }
.prose { white-space: pre-wrap; overflow-wrap: anywhere; }
@media print { body { background: white; color: black; }
  .action { background: #f3f1f8; } section { break-inside: avoid; } }
"""


def _safe_text(text: object) -> str:
    return html.escape(str(text or ""), quote=True)


def _embed_asset(path, limit: dict) -> str | None:
    if limit["count"] >= MAX_INLINE_IMAGES:
        return None
    if path.is_symlink() or not path.is_file():
        return None
    try:
        size = path.stat().st_size
        if not 0 < size <= MAX_IMAGE_BYTES or limit["bytes"] + size > MAX_TOTAL_BYTES:
            return None
        data = path.read_bytes()
    except OSError:
        return None
    if not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        return None
    limit["count"] += 1
    limit["bytes"] += len(data)
    return "data:image/webp;base64," + base64.b64encode(data).decode("ascii")


def render_story_html(narrative, story_id: str) -> bytes:
    story = narrative.get_story(story_id)
    if story is None:
        raise ValueError("Historia inexistente")
    budget = {"count": 0, "bytes": 0}
    body = []
    with narrative.store._conn() as db:
        turns = [dict(r) for r in db.execute(
            "SELECT * FROM story_turns WHERE story_id=? ORDER BY created_at,id",
            (story_id,))]
        visual = {
            r["turn_id"]: r["selected_asset_id"]
            for r in db.execute(
                "SELECT turn_id,selected_asset_id FROM visual_turn_snapshots "
                "WHERE story_id=?", (story_id,))
        }
        gallery_ids = {r["id"] for r in db.execute(
            "SELECT id FROM visual_assets WHERE story_id=?", (story_id,))}
        cover_id = story.get("cover_asset_id")
        if cover_id:
            cover = db.execute(
                "SELECT id,kind FROM creator_media_assets WHERE id=? "
                "AND story_id=? AND kind='cover'", (cover_id,story_id)
            ).fetchone()
            if cover is not None:
                path = narrative.creator_media._path(story_id, cover["id"], cover["kind"])
                uri = _embed_asset(path, budget)
                if uri:
                    body.append('<figure class="cover"><img alt="Portada de la historia" src="'
                                + uri + '"></figure>')

        previous_art = None
        for i, turn in enumerate(turns, 1):
            turn_id = turn["id"]
            frame = ['<section><h2>Escena ' + str(i) + '</h2>']
            selected_id = visual.get(turn_id)
            # No fallback to today's selected image if a historical snapshot is
            # absent: a later illustration cannot appear in an earlier scene.
            if (selected_id and selected_id in gallery_ids
                    and selected_id != previous_art):
                path = narrative.visual._asset_path(story_id, selected_id)
                uri = _embed_asset(path, budget)
                if uri:
                    frame.append('<figure><img alt="Ilustración de la escena '
                                 + str(i) + '" src="' + uri + '"></figure>')
            previous_art = selected_id
            when = datetime.fromtimestamp(
                turn["created_at"], tz=timezone.utc).strftime("%Y-%m-%d")
            mode = {"say":"Diálogo", "do":"Acción",
                    "story":"Dirección", "continue":"Continuación"}.get(
                        turn["mode"], "Intervención")
            frame.append('<small>' + _safe_text(mode) + ' · '
                         + _safe_text(when) + '</small>')
            if turn["input_text"]:
                frame.append('<div class="action">' +
                             _safe_text(turn["input_text"]) + '</div>')
            frame.append('<p class="prose">' +
                         _safe_text(turn["assistant_text"]) + '</p></section>')
            body.extend(frame)
    title = _safe_text(story["title"])
    coverline = _safe_text(story["premise"])
    protagonist = _safe_text(story.get("protagonist_name") or "Protagonista")
    origin = (' · Rama independiente' if story.get("origin_story_id") else '')
    page = ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>' + title + '</title><style>' + STYLES +
            '</style></head><body><main><header><small>NOBLE AI · EXPORTACIÓN LOCAL'
            + _safe_text(origin) + '</small><h1>' + title +
            '</h1><p>' + coverline + '</p><small>Protagonista: ' +
            protagonist + '</small></header>' + ''.join(body) +
            '</main></body></html>')
    return page.encode("utf-8")


def mount_story_export_routes(app, narrative) -> None:
    @app.get("/api/v1/stories/{story_id}/export.html")
    def export_story(story_id: uuid.UUID):
        try:
            content = render_story_html(narrative, str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        return Response(content=content, media_type="text/html; charset=utf-8",
                        headers={
                            "Content-Disposition": 'attachment; filename="noble-story.html"',
                            "Cache-Control": "no-store",
                            "X-Content-Type-Options": "nosniff",
                        })
