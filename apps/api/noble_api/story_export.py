"""Portable self-contained HTML export of a single story/branch.

The export reads committed SQLite turns and immutable per-turn art snapshots.
It never walks the source directory or exposes the creator's private prompt
instructions. Embedded images are bounded and independently validated through
the existing UUID/path checks; no network resources are needed to read it.
"""
from __future__ import annotations

import base64
import html
import io
import uuid
import zipfile
import xml.etree.ElementTree as ET
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


XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
ET.register_namespace("", XHTML_NS)
ET.register_namespace("epub", EPUB_NS)


def render_story_epub(narrative, story_id: str) -> bytes:
    """Create a valid EPUB3 one-volume archive of just the requested timeline.

    No external URLs and no automatic LLM/author-only context. Resource files
    are embedded after passing the same path and byte limits as the HTML export.
    """
    story = narrative.get_story(story_id)
    if story is None:
        raise ValueError("Historia inexistente")
    budget = {"count": 0, "bytes": 0}
    image_files: list[tuple[str, bytes]] = []
    root = ET.Element("{" + XHTML_NS + "}html", {
        "{" + "http://www.w3.org/XML/1998/namespace" + "}lang": "es"
    })
    head = ET.SubElement(root, "{" + XHTML_NS + "}head")
    ET.SubElement(head, "{" + XHTML_NS + "}title").text = story["title"]
    ET.SubElement(head, "{" + XHTML_NS + "}link",
                  {"rel": "stylesheet", "type": "text/css", "href": "style.css"})
    body = ET.SubElement(root, "{" + XHTML_NS + "}body")
    main = ET.SubElement(body, "{" + XHTML_NS + "}main")
    header = ET.SubElement(main, "{" + XHTML_NS + "}header")
    ET.SubElement(header, "{" + XHTML_NS + "}h1").text = story["title"]
    ET.SubElement(header, "{" + XHTML_NS + "}p").text = story["premise"]
    ET.SubElement(header, "{" + XHTML_NS + "}small").text = (
        "Protagonista: " + (story.get("protagonist_name") or "Protagonista"))
    if story.get("origin_story_id"):
        ET.SubElement(header, "{" + XHTML_NS + "}p").text = "Rama independiente"

    def image(path, label: str, cover: bool = False):
        uri = _embed_asset(path, budget)
        if uri is None:
            return None
        name = "images/asset-" + str(len(image_files) + 1) + ".webp"
        image_files.append((name, base64.b64decode(uri.split(",", 1)[1])))
        figure = ET.SubElement(main, "{" + XHTML_NS + "}figure",
                               {"class": "cover"} if cover else {})
        ET.SubElement(figure, "{" + XHTML_NS + "}img",
                      {"src": name, "alt": label})
        return name

    cover_filename = None
    with narrative.store._conn() as db:
        turns = [dict(row) for row in db.execute(
            "SELECT * FROM story_turns WHERE story_id=? ORDER BY created_at,id",
            (story_id,))]
        gallery = {row["id"] for row in db.execute(
            "SELECT id FROM visual_assets WHERE story_id=?", (story_id,))}
        snapshots = {row["turn_id"]: row["selected_asset_id"] for row in db.execute(
            "SELECT turn_id,selected_asset_id FROM visual_turn_snapshots "
            "WHERE story_id=?", (story_id,))}
        cover_id = story.get("cover_asset_id")
        if cover_id:
            row = db.execute(
                "SELECT id,kind FROM creator_media_assets "
                "WHERE story_id=? AND id=? AND kind='cover'",
                (story_id, cover_id)).fetchone()
            if row is not None:
                cover_filename = image(narrative.creator_media._path(
                    story_id, row["id"], row["kind"]),
                    "Portada de la historia", cover=True)
        previous_art = None
        for i, turn in enumerate(turns, 1):
            section = ET.SubElement(main, "{" + XHTML_NS + "}section",
                                    {"id": "chapter-" + str(i)})
            ET.SubElement(section, "{" + XHTML_NS + "}h2").text = "Escena " + str(i)
            selected_id = snapshots.get(turn["id"])
            if selected_id and selected_id in gallery and selected_id != previous_art:
                uri = _embed_asset(narrative.visual._asset_path(story_id, selected_id), budget)
                if uri is not None:
                    name = "images/asset-" + str(len(image_files) + 1) + ".webp"
                    image_files.append((name, base64.b64decode(uri.split(",", 1)[1])))
                    fig = ET.SubElement(section, "{" + XHTML_NS + "}figure")
                    ET.SubElement(fig, "{" + XHTML_NS + "}img",
                                  {"src": name, "alt": "Ilustración de la escena " + str(i)})
            previous_art = selected_id
            mode = {"say": "Diálogo", "do": "Acción", "story": "Dirección",
                    "continue": "Continuación"}.get(turn["mode"], "Intervención")
            ET.SubElement(section, "{" + XHTML_NS + "}small").text = mode
            if turn["input_text"]:
                ET.SubElement(section, "{" + XHTML_NS + "}p",
                              {"class": "action"}).text = turn["input_text"]
            ET.SubElement(section, "{" + XHTML_NS + "}p",
                          {"class": "prose"}).text = turn["assistant_text"]

    xhtml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    title = _safe_text(story["title"])
    identifier = _safe_text("urn:uuid:" + story_id)
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    image_manifest = "".join(
        '<item id="image-' + str(i) + '" href="' + _safe_text(name) +
        '" media-type="image/webp"' +
        (' properties="cover-image"' if name == cover_filename else '') + '/>'
        for i, (name, _) in enumerate(image_files, 1))
    opf = ('<?xml version="1.0" encoding="utf-8"?>'
           '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" '
           'unique-identifier="book-id"><metadata '
           'xmlns:dc="http://purl.org/dc/elements/1.1/">'
           '<dc:identifier id="book-id">' + identifier + '</dc:identifier>'
           '<dc:title>' + title + '</dc:title><dc:language>es</dc:language>'
           '<meta property="dcterms:modified">' + updated + '</meta>'
           '</metadata><manifest>'
           '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>'
           '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
           '<item id="css" href="style.css" media-type="text/css"/>'
           + image_manifest + '</manifest><spine><itemref idref="chapter"/></spine></package>')
    container = ('<?xml version="1.0" encoding="utf-8"?>'
                 '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" '
                 'media-type="application/oebps-package+xml"/></rootfiles></container>')
    nav = ET.Element("{" + XHTML_NS + "}html", {
        "{" + "http://www.w3.org/XML/1998/namespace" + "}lang": "es"
    })
    nav_body = ET.SubElement(nav, "{" + XHTML_NS + "}body")
    toc = ET.SubElement(nav_body, "{" + XHTML_NS + "}nav",
                        {"{" + EPUB_NS + "}type": "toc"})
    ET.SubElement(toc, "{" + XHTML_NS + "}h1").text = "Índice"
    toc_ol = ET.SubElement(toc, "{" + XHTML_NS + "}ol")
    for i in range(1, len(turns) + 1):
        li = ET.SubElement(toc_ol, "{" + XHTML_NS + "}li")
        ET.SubElement(li, "{" + XHTML_NS + "}a",
                      {"href": "chapter.xhtml#chapter-" + str(i)}).text = "Escena " + str(i)

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        # EPUB specification: mimetype must be the first ZIP entry, stored raw.
        archive.writestr("mimetype", b"application/epub+zip",
                         compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", container.encode("utf-8"))
        archive.writestr("OEBPS/content.opf", opf.encode("utf-8"))
        archive.writestr("OEBPS/nav.xhtml", ET.tostring(
            nav, encoding="utf-8", xml_declaration=True))
        archive.writestr("OEBPS/chapter.xhtml", xhtml)
        archive.writestr("OEBPS/style.css", STYLES.encode("utf-8"))
        for name, content in image_files:
            archive.writestr("OEBPS/" + name, content)
    return out.getvalue()


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

    @app.get("/api/v1/stories/{story_id}/export.epub")
    def export_epub(story_id: uuid.UUID):
        try:
            content = render_story_epub(narrative, str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        return Response(content=content, media_type="application/epub+zip",
                        headers={
                            "Content-Disposition": 'attachment; filename="noble-story.epub"',
                            "Cache-Control": "no-store",
                            "X-Content-Type-Options": "nosniff",
                        })
