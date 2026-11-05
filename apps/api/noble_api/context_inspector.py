"""Read-only inspector of the exact chat messages prepared for the narrator.

Token counts are explicitly heuristic: no model tokenizer or KV-cache metrics
are inferred. This route is author-facing, alongside Creator's private inputs.
"""
from __future__ import annotations

from math import ceil
import re
from typing import Literal
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class ContextPreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input_text: str = Field(default="", max_length=3000)
    mode: Literal["say", "do", "story", "continue"] = "do"


def _label_system(part: str, index: int) -> str:
    if index == 0:
        return "Instrucciones, premisa y canon"
    if part.startswith(("Contexto interno de la historia", "Directrices de narración",
                        "NPC controlados por el narrador", "Recordatorio persistente")):
        return "Creador y personajes"
    if part.startswith("Lorebook activado"):
        return "Lorebook"
    if part.startswith(("Estado estructurado confirmado", "Lugar:", "Momento:",
                        "Clima:", "Personajes presentes:", "Inventario confirmado:",
                        "Indicadores confirmados:")):
        return "Estado del mundo"
    return "Sistema y contexto"


def _approx_tokens(text: str) -> int:
    return ceil(len(text) / 4)


def preview_context(narrative, story_id: str, text: str, mode: str) -> dict:
    story = narrative.get_story(story_id)
    if story is None:
        raise ValueError("Historia inexistente")
    if mode not in {"say", "do", "story", "continue"}:
        raise ValueError("Modo de interacción inválido")
    if mode != "continue" and not text.strip():
        raise ValueError("Escribe una intervención para inspeccionar el contexto")
    messages = narrative.messages(story, text.strip(), mode)
    config = narrative.config()
    sections: list[dict] = []

    def add(name: str, content: str) -> None:
        sections.append({"name": name, "characters": len(content),
                         "approx_tokens": _approx_tokens(content)})

    first = messages[0]["content"]
    for i, part in enumerate(first.split("\n\n")):
        prefix = "\n\n" if i else ""
        if i == 0:
            # Separate the fixed narrator prefix, public premise and optional
            # canonical facts without changing a single byte of the prompt.
            fragments = re.split(
                r"(?=\nPremisa: |\nCanon persistente confirmado de la historia: )",
                part)
            for index, fragment in enumerate(fragments):
                if not fragment:
                    continue
                name = ("Premisa y protagonista" if fragment.startswith("\nPremisa:")
                        else "Canon fijo" if fragment.startswith("\nCanon persistente")
                        else "Sistema y preferencias")
                add(name, prefix + fragment if index == 0 else fragment)
        else:
            add(_label_system(part, i), prefix + part)
    for idx, message in enumerate(messages[1:], 1):
        content = message["content"]
        if idx == len(messages) - 1:
            name = "Intervención actual"
        elif content.startswith("[Recuerdo de una intervención pasada"):
            name = "Episodios recuperados"
        else:
            name = "Historial reciente"
        add(name, content)

    # Add small message-boundary overhead, not a model-specific guarantee.
    prompt_estimate = sum(_approx_tokens(m["content"]) + 4 for m in messages)
    reserved = int(config["max_tokens"])
    window = int(config["num_ctx"])
    return {
        "story_id": story_id, "messages": messages,
        "sections": sections,
        "total_characters": sum(len(m["content"]) for m in messages),
        "estimated_prompt_tokens": prompt_estimate,
        "reserved_output_tokens": reserved, "context_window_tokens": window,
        "estimated_total_tokens": prompt_estimate + reserved,
        "estimated_overflow": prompt_estimate + reserved > window,
        "token_counts_exact": False,
        "token_estimate_method": "ceil(characters/4) + 4 per message; not a model tokenizer",
        "runtime_kv_cache_measured": False,
    }


def mount_context_inspector_routes(app, narrative) -> None:
    @app.post("/api/v1/stories/{story_id}/context/preview")
    def context_preview(story_id: uuid.UUID, body: ContextPreviewInput):
        try:
            return preview_context(narrative, str(story_id),
                                   body.input_text, body.mode)
        except ValueError as exc:
            status = 404 if "inexistente" in str(exc) else 422
            raise HTTPException(status, str(exc)) from exc
