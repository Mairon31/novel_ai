"""Deterministic visual director and reusable background lookup.

This subsystem NEVER calls an image model. A reusable background is an
explicitly registered manual gallery asset, indexed by a stable context key
in the existing render_signature field. Generated ComfyUI render signatures
are kept intact; no schema changes or unexported cache tables are needed.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class DirectorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Literal["auto", "background", "emotion", "event"] = "auto"


class RegisterBackground(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_cache_key: str = Field(min_length=76, max_length=76)


class ApplyBackground(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: uuid.UUID
    expected_cache_key: str = Field(min_length=76, max_length=76)


def _normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


class VisualDirector:
    def __init__(self, visual, planner, world):
        self.visual = visual
        self.planner = planner
        self.world = world

    def context(self, story_id: str) -> dict:
        scene = self.visual.scene(story_id)
        plan = self.planner.read(story_id)
        state = self.world.current(story_id)["state"]
        location = _normalize(state["location"] or scene["location"])
        ctx = {
            "location": location,
            "time_of_day": _normalize(state["time_of_day"]),
            "weather": _normalize(state["weather"]),
            "shot": plan["shot"],
            "lighting": plan["lighting"],
        }
        encoded = json.dumps(ctx, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":")).encode("utf-8")
        signature = "noble-bg-v1:" + hashlib.sha256(encoded).hexdigest()
        return {"scene_id": scene["id"], "context": ctx,
                "cache_key": signature}

    def preview(self, story_id: str, intent: str = "auto") -> dict:
        if intent not in {"auto", "background", "emotion", "event"}:
            raise ValueError("Intención de director no permitida")
        info = self.context(story_id)
        found = self.visual.cached(story_id, info["cache_key"])
        asset = found if found and found["origin"] == "manual" else None
        if intent == "event":
            action = "GENERATE_EVENT_CG"
            reason = "Evento solicitado: ilustración CG nueva, sin reemplazar el fondo."
        elif intent == "emotion" and asset:
            action = "UPDATE_SPRITE_EMOTION"
            reason = "Solo cambia la expresión; el fondo registrado se reutiliza."
        elif asset:
            action = "REUSE_BACKGROUND"
            reason = "Fondo manual registrado para el mismo lugar, hora, clima, plano y luz."
        else:
            action = "GENERATE_NEW_BACKGROUND"
            reason = "No hay fondo registrado para estas condiciones; requiere imagen explícita."
        return {
            **info, "action": action,
            "background_asset_id": asset["id"] if asset else None,
            "background_url": (f"/api/v1/stories/{story_id}/gallery/{asset['id']}"
                               if asset else None),
            "background_cached": asset is not None,
            "inference_used": False, "generation_started": False,
            "reason": reason,
        }

    def register(self, story_id: str, asset_id: str,
                 expected_key: str) -> dict:
        info = self.context(story_id)
        if info["cache_key"] != expected_key:
            raise RuntimeError("La escena cambió: actualiza el director antes de registrar")
        # Atomic update, owner-bound and manual-only. A ComfyUI asset retains
        # its full deterministic generation signature; no cache corruption.
        with self.visual.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT origin,render_signature FROM visual_assets "
                "WHERE story_id=? AND id=?", (story_id, asset_id)).fetchone()
            if not row:
                raise ValueError("El recurso visual no pertenece a esta historia")
            if row["origin"] != "manual":
                raise ValueError("Solo se registran fondos importados manualmente")
            if row["render_signature"] and not row["render_signature"].startswith("noble-bg-v1:"):
                raise ValueError("El recurso tiene una firma de generación que no se puede reemplazar")
            path = self.visual._asset_path(story_id, asset_id)
            if not path.is_file() or path.is_symlink():
                raise ValueError("El archivo de fondo no está disponible o no es confiable")
            db.execute(
                "UPDATE visual_assets SET render_signature=? "
                "WHERE story_id=? AND id=?", (expected_key, story_id, asset_id))
        return self.preview(story_id)

    def apply(self, story_id: str, asset_id: str,
              expected_key: str) -> dict:
        info = self.preview(story_id)
        if info["cache_key"] != expected_key:
            raise RuntimeError("El contexto visual cambió antes de aplicar el fondo")
        if info["background_asset_id"] != asset_id:
            raise RuntimeError("El fondo disponible cambió: actualiza la vista previa")
        gallery = self.visual.choose(story_id, asset_id)
        return {"selected_asset_id": gallery["selected_asset_id"],
                "action": "REUSE_BACKGROUND",
                "inference_used": False,
                "generation_started": False,
                "background_cached": True,
                "scene_id": info["scene_id"]}


def mount_visual_director_routes(app, director: VisualDirector) -> None:
    @app.post("/api/v1/stories/{story_id}/visual-director/preview")
    def preview(story_id: uuid.UUID, body: DirectorRequest):
        try:
            return director.preview(str(story_id), body.intent)
        except ValueError as exc:
            raise HTTPException(404 if "inexistente" in str(exc) else 422,
                                str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/visual-director/backgrounds/{asset_id}")
    def register(story_id: uuid.UUID, asset_id: uuid.UUID, body: RegisterBackground):
        try:
            return director.register(str(story_id), str(asset_id),
                                     body.expected_cache_key)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/visual-director/apply")
    def apply(story_id: uuid.UUID, body: ApplyBackground):
        try:
            return director.apply(str(story_id), str(body.asset_id),
                                  body.expected_cache_key)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
