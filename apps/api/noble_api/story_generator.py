"""Opt-in Creator Studio world generation; no DB writes before confirmation."""
from __future__ import annotations

import asyncio
import json
import re

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from .story_hub import StoryHubService, _validate_pack


class Idea(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idea: str = Field(min_length=30, max_length=2500)
    protagonist_name: str = Field(default="Alex", min_length=1, max_length=60)
    genre: str = Field(default="", max_length=80)
    tone: str = Field(default="", max_length=120)


class Core(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=100)
    synopsis: str = Field(min_length=25, max_length=250)
    player_plot: str = Field(min_length=50, max_length=4000)
    ai_plot: str = Field(min_length=100, max_length=12000)
    guidelines: str = Field(min_length=50, max_length=4000)
    reminder: str = Field(min_length=15, max_length=1200)
    openings: list[str] = Field(min_length=3, max_length=3)
    genre: str = Field(min_length=2, max_length=80)
    tags: list[str] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def check_openings(self):
        if any(not 40 <= len(item.strip()) <= 3000 for item in self.openings):
            raise ValueError("Cada apertura requiere 40–3000 caracteres")
        if len(set(x.strip().casefold() for x in self.openings)) != 3:
            raise ValueError("Las aperturas deben ser diferentes")
        if any(not 2 <= len(tag.strip()) <= 40 for tag in self.tags):
            raise ValueError("Las etiquetas deben tener entre 2 y 40 caracteres")
        return self


class Npc(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=30, max_length=3000)
    personality: str = Field(min_length=15, max_length=1500)
    dialogue_examples: str = Field(min_length=15, max_length=3000)


class Lore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=100)
    content: str = Field(min_length=30, max_length=3500)
    keys: list[str] = Field(min_length=1, max_length=8)


class StoryDraft(Core):
    protagonist_name: str = Field(min_length=1, max_length=60)
    characters: list[Npc] = Field(min_length=4, max_length=4)
    lore: list[Lore] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def check_names(self):
        for values in ([x.name.strip().casefold() for x in self.characters],
                       [x.title.strip().casefold() for x in self.lore]):
            if len(values) != len(set(values)) or "" in values:
                raise ValueError("Los nombres y títulos deben ser únicos y no vacíos")
        if not self.protagonist_name.strip():
            raise ValueError("El protagonista no puede estar vacío")
        return self


def parse_json(text: str) -> dict:
    payload = text.strip()
    fence = chr(96) * 3
    if payload.startswith(fence):
        pattern = re.escape(fence) + r"(?:json)?\s*(.*?)\s*" + re.escape(fence)
        match = re.fullmatch(pattern, payload, re.S | re.I)
        if not match:
            raise ValueError("El modelo produjo un bloque JSON incompleto")
        payload = match.group(1)
    if len(payload) > 30000:
        raise ValueError("Respuesta del modelo demasiado extensa")
    try:
        value = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("El modelo no devolvió JSON válido") from exc
    if not isinstance(value, dict):
        raise ValueError("Se esperaba un objeto JSON")
    return value


class StoryGenerator:
    def __init__(self, narrative):
        self.narrative = narrative
        self.hub = StoryHubService(narrative)

    async def ask(self, config: dict, system: str, prompt: str) -> dict:
        chunks, length = [], 0
        async with asyncio.timeout(180):
            async for piece in self.narrative.generate(config, [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ]):
                length += len(piece)
                if length > 30000:
                    raise ValueError("El modelo excedió el límite de salida")
                chunks.append(piece)
        return parse_json("".join(chunks))

    async def draft(self, body: Idea) -> dict:
        if not body.idea.strip() or not body.protagonist_name.strip():
            raise HTTPException(422, "La idea y el protagonista son obligatorios")
        config = self.narrative.config()
        if not config.get("model", "").strip():
            raise HTTPException(409, "Configura un modelo narrador antes de crear una historia con IA.")
        config = {**config, "max_tokens": 2048,
                  "temperature": min(config.get("temperature", 0.7), 0.85)}
        system = (
            "Diseña una novela visual interactiva original. Responde SOLO JSON válido "
            "sin markdown ni comentarios; español latinoamericano es-419. Mantén "
            "continuidad, reglas, secretos y consecuencias. No escribas elecciones, "
            "pensamientos ni diálogos del protagonista. Sustitúyelo por {{user}} "
            "en las aperturas. No agregues claves ajenas al esquema solicitado."
        )
        idea = ("IDEA DE FICCIÓN:\n" + body.idea + "\nPROTAGONISTA: " +
                body.protagonist_name + "\nGÉNERO: " + (body.genre or "libre") +
                "\nTONO: " + (body.tone or "inmersivo"))
        acquired = False
        try:
            if (self.narrative.resources is not None and
                    config["provider"] in {"ollama", "koboldcpp"} and
                    config.get("device") != "cpu"):
                acquired = await self.narrative.resources.claim_local_gpu("creación de mundos")
            core = Core.model_validate(await self.ask(config, system, idea +
                "\nETAPA 1: devuelve las claves title, synopsis, player_plot "
                "(público sin spoilers), ai_plot (privado con secretos, arcos y desenlaces), "
                "guidelines, reminder, genre, tags (2-5) y openings "
                "(exactamente 3 aperturas distintas de 60-150 palabras cada una)."))
            cast_result = await self.ask(config, system, idea +
                "\nMUNDO CANÓNICO:\n" + json.dumps({
                    "player_plot": core.player_plot, "ai_plot": core.ai_plot,
                    "title": core.title}, ensure_ascii=False) +
                "\nETAPA 2: devuelve SOLO una clave characters con exactamente "
                "4 personajes, cada uno name, description, personality, dialogue_examples. "
                "NPCs consistentes con el mundo, con motivaciones y conflictos propios.")
            cast = cast_result.get("characters")
            if not isinstance(cast, list) or len(cast) != 4:
                raise ValueError("El reparto debe contener exactamente 4 personajes")
            cast = [Npc.model_validate(x) for x in cast]
            lore_result = await self.ask(config, system, idea +
                "\nCANON:\n" + json.dumps({
                    "title": core.title, "ai_plot": core.ai_plot,
                    "characters": [npc.name for npc in cast]}, ensure_ascii=False) +
                "\nETAPA 3: devuelve SOLO una clave lore con exactamente 3 "
                "entradas, cada una title, content, keys (1-4 frases activadoras). "
                "Entradas útiles durante el juego, coherentes con la trama.")
            lore = lore_result.get("lore")
            if not isinstance(lore, list) or len(lore) != 3:
                raise ValueError("El Lorebook debe tener exactamente 3 entradas")
            draft = StoryDraft.model_validate({
                **core.model_dump(), "protagonist_name": body.protagonist_name,
                "characters": cast, "lore": [Lore.model_validate(x) for x in lore],
            })
            _validate_pack(self.to_pack(draft))
            return {"draft": draft.model_dump(), "saved": False,
                    "stages_completed": 3, "model": config["model"]}
        except (ValueError, ValidationError) as exc:
            raise HTTPException(422, "La propuesta no pasó la validación: " +
                                str(exc)[:280]) from exc
        except (httpx.HTTPError, OSError, TimeoutError) as exc:
            raise HTTPException(502, "La generación no terminó: " +
                                str(exc)[:250]) from exc
        finally:
            if self.narrative.resources is not None:
                self.narrative.resources.release_local_gpu(acquired)

    @staticmethod
    def to_pack(draft: StoryDraft) -> dict:
        return {
            "id": "creator-ai", "version": "1.0.0", "author": "Creator Studio",
            "title": draft.title.strip(), "protagonist": draft.protagonist_name.strip(),
            "genre": draft.genre, "tags": draft.tags, "language": "es-419",
            "synopsis": draft.synopsis, "player_plot": draft.player_plot,
            "ai_plot": draft.ai_plot, "guidelines": draft.guidelines,
            "reminder": draft.reminder, "openings": draft.openings,
            "characters": [(x.name, x.description, x.personality, x.dialogue_examples)
                           for x in draft.characters],
            "lore": [(x.title, x.content, x.keys) for x in draft.lore],
        }

    def install(self, draft: StoryDraft) -> dict:
        result = self.hub.install_pack(self.to_pack(draft),
                                       draft.protagonist_name.strip(), "creator-ai")
        return {**result, "source": "creator-ai", "generated_media": 0}


def mount_story_generator_routes(app, narrative):
    generator = StoryGenerator(narrative)

    @app.post("/api/v1/creator/assistant/draft")
    async def generate_world(body: Idea):
        return await generator.draft(body)

    @app.post("/api/v1/creator/assistant/install", status_code=201)
    def install_world(body: StoryDraft):
        try:
            return generator.install(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
