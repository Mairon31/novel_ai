"""Noble AI first playable narrative slice.

External Ollama and KoboldCpp adapters, real model streaming, and durable story
turns. No fake completions, local network URLs only, no GPU models at API startup.
World-state extraction/branching and managed KoboldCpp startup are later phases.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import uuid
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .store import Store


DEFAULT_LLM = {
    "provider": "ollama",
    "base_url": "http://127.0.0.1:11434",
    "model": "",
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 450,
    "num_ctx": 4096,
    "device": "auto",
}

PROMPT = (
    "Eres el narrador de una novela visual interactiva. Escribe únicamente "
    "en español latinoamericano natural (es-419). Mantén continuidad, "
    "personalidades y consecuencias de la historia. Narra acciones de NPC, "
    "escenarios y sus diálogos; nunca decidas lo que hará, sentirá o dirá "
    "el protagonista controlado por el jugador. No repitas ni resumas "
    "constantemente. Termina dejando espacio a la intervención del jugador."
)


def validate_endpoint(value: str) -> str:
    """Block remote services, custom paths and credentials in this local-only MVP."""
    try:
        u = urlsplit(value.strip())
        if (u.scheme != "http" or u.hostname not in {"localhost", "127.0.0.1", "::1"}
                or u.username or u.password or u.path not in {"", "/"}
                or u.query or u.fragment or u.port is None
                or not (1 <= u.port <= 65535)):
            raise ValueError("Solo se permiten endpoints HTTP locales con puerto, sin rutas")
    except (ValueError, AttributeError) as exc:
        raise ValueError("URL no admitida. Usa http://127.0.0.1:11434 o :5001") from exc
    # Never store a path to avoid accidental duplicate /v1 segments.
    return value.strip().rstrip("/")


class LlmSettings(BaseModel):
    provider: str = "ollama"
    base_url: str = "http://127.0.0.1:11434"
    model: str = Field(default="", max_length=180)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)
    max_tokens: int = Field(default=450, ge=50, le=2048)
    num_ctx: int = Field(default=4096, ge=512, le=32768)
    device: str = "auto"  # Ollama supports cpu via num_gpu=0


class CreateStory(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    premise: str = Field(min_length=10, max_length=4000)


class TurnRequest(BaseModel):
    input_text: str = Field(default="", max_length=3000)
    mode: str = "do"
    request_id: uuid.UUID


def encode_event(event: str, payload: dict) -> str:
    return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


class NarrativeService:
    def __init__(self, store: Store, transport: httpx.AsyncBaseTransport | None = None):
        self.store = store
        self.transport = transport
        self.locks: dict[str, asyncio.Lock] = {}
        with store._conn() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS llm_preferences (
                id INTEGER PRIMARY KEY CHECK(id=1), settings_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, premise TEXT NOT NULL,
                created_at REAL NOT NULL, updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS story_turns (
                id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
                request_id TEXT NOT NULL, mode TEXT NOT NULL, input_text TEXT NOT NULL,
                assistant_text TEXT NOT NULL, model TEXT NOT NULL,
                created_at REAL NOT NULL,
                UNIQUE(story_id, request_id)
            );
            CREATE INDEX IF NOT EXISTS idx_story_turns_story
                ON story_turns(story_id, created_at, id);
            """)
            db.execute("INSERT OR IGNORE INTO llm_preferences VALUES (1,?)",
                       (json.dumps(DEFAULT_LLM),))

    def config(self) -> dict:
        with self.store._conn() as db:
            row = db.execute("SELECT settings_json FROM llm_preferences WHERE id=1").fetchone()
            return json.loads(row[0])

    def configure(self, settings: LlmSettings) -> dict:
        data = settings.model_dump()
        if data["provider"] not in ("ollama", "koboldcpp"):
            raise ValueError("El proveedor debe ser Ollama o KoboldCpp")
        if data["device"] not in ("auto", "cpu"):
            raise ValueError("Dispositivo no soportado; Auto o CPU")
        if data["provider"] == "koboldcpp" and data["device"] != "auto":
            raise ValueError("KoboldCpp configura GPU/CPU al iniciar el ejecutable, no por API")
        data["base_url"] = validate_endpoint(data["base_url"])
        data["model"] = data["model"].strip()
        with self.store._conn() as db:
            db.execute("UPDATE llm_preferences SET settings_json=? WHERE id=1",
                       (json.dumps(data),))
        return self.config()

    async def _get_json(self, url: str) -> dict:
        async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                                     timeout=httpx.Timeout(8)) as client:
            res = await client.get(url, follow_redirects=False)
            res.raise_for_status()
            data = res.json()
            if not isinstance(data, dict):
                raise ValueError("Formato de proveedor incorrecto")
            return data

    async def available_models(self) -> dict:
        cfg = self.config()
        base = validate_endpoint(cfg["base_url"])
        route = "/api/tags" if cfg["provider"] == "ollama" else "/v1/models"
        try:
            data = await self._get_json(base + route)
            raw = data.get("models", []) if cfg["provider"] == "ollama" else data.get("data", [])
            names = [m.get("name" if cfg["provider"] == "ollama" else "id")
                     for m in raw if isinstance(m, dict)]
            names = [str(m) for m in names if isinstance(m, str) and m]
            return {"online": True, "provider": cfg["provider"], "models": names,
                    "selected": cfg["model"], "device": cfg["device"]}
        except (httpx.HTTPError, ValueError, OSError) as exc:
            return {"online": False, "provider": cfg["provider"], "models": [],
                    "selected": cfg["model"], "device": cfg["device"],
                    "error": str(exc)[:240]}

    def create_story(self, title: str, premise: str) -> dict:
        story_id, now = str(uuid.uuid4()), time.time()
        with self.store._conn() as db:
            db.execute("INSERT INTO stories VALUES (?,?,?,?,?)",
                       (story_id, title.strip(), premise.strip(), now, now))
        return self.get_story(story_id)

    def stories(self) -> list[dict]:
        with self.store._conn() as db:
            return [dict(r) for r in db.execute(
                "SELECT * FROM stories ORDER BY updated_at DESC, id LIMIT 250")]

    def get_story(self, story_id: str) -> dict | None:
        with self.store._conn() as db:
            row = db.execute("SELECT * FROM stories WHERE id=?", (story_id,)).fetchone()
            return dict(row) if row else None

    def turns(self, story_id: str, limit: int = 100) -> list[dict]:
        with self.store._conn() as db:
            return [dict(r) for r in db.execute(
                "SELECT * FROM (SELECT * FROM story_turns WHERE story_id=? "
                "ORDER BY created_at DESC, id DESC LIMIT ?) "
                "ORDER BY created_at ASC, id ASC", (story_id, limit))]

    def previous(self, story_id: str, request_id: str) -> dict | None:
        with self.store._conn() as db:
            r = db.execute(
                "SELECT * FROM story_turns WHERE story_id=? AND request_id=?",
                (story_id, request_id)).fetchone()
            return dict(r) if r else None

    def append(self, story_id: str, request_id: str, mode: str,
               instruction: str, response: str, model: str) -> dict:
        with self.store._conn() as db:
            old = db.execute(
                "SELECT * FROM story_turns WHERE story_id=? AND request_id=?",
                (story_id, request_id)).fetchone()
            if old:
                return dict(old)
            turn_id, now = str(uuid.uuid4()), time.time()
            db.execute("INSERT INTO story_turns VALUES (?,?,?,?,?,?,?,?)",
                       (turn_id, story_id, request_id, mode, instruction, response, model, now))
            db.execute("UPDATE stories SET updated_at=? WHERE id=?", (now, story_id))
        return self.previous(story_id, request_id)

    def messages(self, story: dict, instruction: str, mode: str) -> list[dict]:
        messages = [{"role": "system", "content": PROMPT + "\nPremisa: " + story["premise"]}]
        for t in self.turns(story["id"], limit=16):
            messages.append({"role": "user", "content": t["mode"] + ": " + t["input_text"]})
            messages.append({"role": "assistant", "content": t["assistant_text"]})
        line = {"say": "El protagonista dice", "do": "El protagonista hace",
                "story": "El jugador dirige la historia", "continue": "Continúa la escena"
                }[mode]
        messages.append({"role": "user", "content": line + ": " + (instruction or "Prosigue desde aquí")})
        return messages

    async def generate(self, config: dict, messages: list[dict]):
        model = config["model"].strip()
        if not model:
            raise ValueError("Selecciona un modelo disponible en el proveedor antes de generar")
        base = validate_endpoint(config["base_url"])
        if config["provider"] == "ollama":
            path = "/api/chat"
            options = {"temperature": config["temperature"], "top_p": config["top_p"],
                       "num_ctx": config["num_ctx"], "num_predict": config["max_tokens"]}
            if config["device"] == "cpu":
                options["num_gpu"] = 0
            payload = {"model": model, "messages": messages, "stream": True,
                       "options": options, "keep_alive": "30m"}
        else:
            path = "/v1/chat/completions"
            payload = {"model": model, "messages": messages, "stream": True,
                       "temperature": config["temperature"],
                       "top_p": config["top_p"], "max_tokens": config["max_tokens"]}
        timeout = httpx.Timeout(240, connect=5, read=240, write=20, pool=5)
        async with httpx.AsyncClient(transport=self.transport, trust_env=False,
                                     timeout=timeout) as client:
            async with client.stream("POST", base + path, json=payload,
                                     follow_redirects=False) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    if config["provider"] == "koboldcpp":
                        if not line.startswith("data:"):
                            continue
                        line = line.removeprefix("data:").strip()
                        if line == "[DONE]":
                            break
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if config["provider"] == "ollama":
                        chunk = (data.get("message") or {}).get("content") or ""
                        if data.get("error"):
                            raise ValueError(str(data["error"])[:300])
                    else:
                        choices = data.get("choices") or []
                        delta = choices[0].get("delta") or {} if choices else {}
                        chunk = delta.get("content") or ""
                    if isinstance(chunk, str) and chunk:
                        yield chunk

    async def stream_turn(self, story_id: str, request_id: str,
                          mode: str, instruction: str):
        lock = self.locks.setdefault(story_id, asyncio.Lock())
        async with lock:
            prior = self.previous(story_id, request_id)
            if prior:
                yield encode_event("done", {"turn": prior, "replayed": True})
                return
            story = self.get_story(story_id)
            if not story:
                yield encode_event("error", {"message": "Historia inexistente"})
                return
            config = self.config()
            collected: list[str] = []
            try:
                async for piece in self.generate(config, self.messages(story, instruction, mode)):
                    collected.append(piece)
                    if sum(map(len, collected)) > 40000:
                        raise ValueError("La salida excedió el límite de longitud")
                    yield encode_event("delta", {"text": piece})
                text = "".join(collected).strip()
                if not text:
                    raise ValueError("El modelo no produjo narración")
                turn = self.append(story_id, request_id, mode, instruction, text, config["model"])
                yield encode_event("done", {"turn": turn, "replayed": False})
            except (httpx.HTTPError, ValueError, OSError, sqlite3.Error) as exc:
                # Never commit an incomplete story turn.
                yield encode_event("error", {"message": str(exc)[:400]})


def mount_narrative_routes(app, narrative: NarrativeService):
    @app.get("/api/v1/narrative/config")
    def get_config():
        return narrative.config()

    @app.put("/api/v1/narrative/config")
    def set_config(body: LlmSettings):
        try:
            return narrative.configure(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/narrative/models")
    async def get_models():
        return await narrative.available_models()

    @app.get("/api/v1/stories")
    def get_stories():
        return {"stories": narrative.stories()}

    @app.post("/api/v1/stories", status_code=201)
    def new_story(body: CreateStory):
        return narrative.create_story(body.title, body.premise)

    @app.get("/api/v1/stories/{story_id}")
    def get_story(story_id: uuid.UUID):
        story = narrative.get_story(str(story_id))
        if not story:
            raise HTTPException(404, "Historia inexistente")
        return story

    @app.get("/api/v1/stories/{story_id}/turns")
    def get_turns(story_id: uuid.UUID):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        return {"turns": narrative.turns(str(story_id))}

    @app.post("/api/v1/stories/{story_id}/generate")
    async def stream_story(story_id: uuid.UUID, body: TurnRequest):
        if not narrative.get_story(str(story_id)):
            raise HTTPException(404, "Historia inexistente")
        if body.mode not in {"say", "do", "story", "continue"}:
            raise HTTPException(422, "Modo de interacción inválido")
        if body.mode != "continue" and not body.input_text.strip():
            raise HTTPException(422, "Debes escribir una acción, diálogo o indicación")
        return StreamingResponse(
            narrative.stream_turn(str(story_id), str(body.request_id),
                                  body.mode, body.input_text.strip()),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
