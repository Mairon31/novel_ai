"""User-provided story scene art, normalized to safe WebP in private data folder.

No web retrieval, no AI generation, no third-party assets bundled. Images can be
uploaded later by a scene-generation adapter as a separate trusted workflow.
"""
from __future__ import annotations

import uuid

from fastapi import File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .narrative import NarrativeService

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000


class ProtagonistName(BaseModel):
    name: str = Field(min_length=1, max_length=60)


def mount_media_routes(app, narrative: NarrativeService):
    @app.patch("/api/v1/stories/{story_id}/protagonist")
    def set_protagonist(story_id: uuid.UUID, body: ProtagonistName):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia no encontrada")
        return narrative.set_protagonist(str(story_id), body.name)

    @app.post("/api/v1/stories/{story_id}/scene-image")
    async def upload_scene(story_id: uuid.UUID, file: UploadFile = File(...)):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia no encontrada")
        if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(415, "Solo se aceptan imágenes PNG, JPEG o WebP")
        data = await file.read(MAX_IMAGE_BYTES + 1)
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "La ilustración supera el límite de 12 MB")
        try:
            narrative.visual.publish(str(story_id), data, origin="manual")
        except ValueError as exc:
            raise HTTPException(422, "No se pudo procesar la imagen enviada: " + str(exc)[:150]) from exc
        return narrative.get_story(str(story_id))

    @app.get("/api/v1/stories/{story_id}/scene-image")
    def get_scene(story_id: uuid.UUID):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia no encontrada")
        target = narrative.store.root / "story-assets" / str(story_id) / "scene.webp"
        if not target.is_file():
            raise HTTPException(404, "La historia todavía no tiene ilustración")
        return FileResponse(target, media_type="image/webp",
                            headers={"Cache-Control": "no-store",
                                     "X-Content-Type-Options": "nosniff"})
