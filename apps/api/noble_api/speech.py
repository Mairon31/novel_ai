"""Lazy Piper TTS: only synthesizes a previously saved turn on explicit click.

Requires Piper installed separately on PATH and an ONNX voice with its .json
sidecar in Noble AI's data/models/voices. It never scans arbitrary folders,
loads a voice at startup or synthesizes during narrative generation.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict

from .narrative import NarrativeService


class SpeechPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_voice_id: str = Field(default="", max_length=180)


class SpeechRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=180)
    request_source: str = "listen_button"


class SpeechService:
    def __init__(self, narrative: NarrativeService):
        self.narrative = narrative
        self.root = (narrative.store.models_dir / "voices").resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = asyncio.Lock()
        with narrative.store._conn() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS tts_preferences(
                id INTEGER PRIMARY KEY CHECK(id=1), default_voice_id TEXT NOT NULL
            )""")
            conn.execute("INSERT OR IGNORE INTO tts_preferences VALUES(1,'')")

    def preferences(self) -> dict:
        with self.narrative.store._conn() as db:
            row = db.execute("SELECT default_voice_id FROM tts_preferences WHERE id=1").fetchone()
        return {"default_voice_id": row["default_voice_id"] if row else ""}

    def set_preferences(self, data: SpeechPreferences) -> dict:
        voice = data.default_voice_id.strip()
        if voice:
            # A selected model must actually be present and accompanied by its
            # Piper config. Selection does not launch or synthesize anything.
            self.voice_path(voice)
        with self.narrative.store._conn() as db:
            db.execute("UPDATE tts_preferences SET default_voice_id=? WHERE id=1", (voice,))
        return self.preferences()

    def voices(self) -> dict:
        detected = []
        for model in sorted(self.root.glob("*.onnx")):
            if model.is_symlink() or not model.is_file():
                continue
            sidecar = Path(str(model) + ".json")
            if not sidecar.is_file() or sidecar.is_symlink():
                continue
            detected.append({"id": model.name, "name": model.stem})
        return {"engine": "piper", "available": shutil.which("piper") is not None,
                "voices": detected, "models_dir": str(self.root),
                "device": "cpu", "on_demand_only": True}

    def voice_path(self, voice_id: str) -> Path:
        if not voice_id.endswith(".onnx") or "/" in voice_id or "\\" in voice_id or voice_id.startswith("."):
            raise HTTPException(422, "Nombre de voz inválido")
        target = self.root / voice_id
        if not target.is_file() or target.is_symlink():
            raise HTTPException(422, "La voz Piper no está instalada")
        sidecar = Path(str(target) + ".json")
        if not sidecar.is_file() or sidecar.is_symlink():
            raise HTTPException(422, "Falta la configuración JSON de la voz Piper")
        return target

    async def synthesize(self, story_id: str, turn_id: str,
                         request: SpeechRequest) -> FileResponse:
        if request.request_source != "listen_button":
            raise HTTPException(422, "El audio debe solicitarse expresamente")
        settings = self.narrative.store.settings()
        if not settings.get("tts_enabled"):
            raise HTTPException(403, "Activa el TTS desde Ajustes para escuchar la narración")
        if not self.narrative.get_story(story_id):
            raise HTTPException(404, "Historia no encontrada")
        with self.narrative.store._conn() as db:
            turn = db.execute("SELECT assistant_text FROM story_turns WHERE id=? AND story_id=?",
                              (turn_id, story_id)).fetchone()
        if not turn:
            raise HTTPException(404, "La intervención solicitada no existe")
        text = str(turn["assistant_text"]).strip()
        if not text:
            raise HTTPException(422, "La intervención no tiene texto")
        if len(text) > 3500:
            raise HTTPException(413, "El texto supera el límite por síntesis de 3500 caracteres")
        model = self.voice_path(request.voice_id)
        executable = shutil.which("piper")
        if not executable:
            raise HTTPException(503, "Piper no está instalado en PATH")
        signature = f"{model.name}:{model.stat().st_mtime_ns}:{model.stat().st_size}"
        key = hashlib.sha256((signature + "\n" + text).encode("utf-8")).hexdigest()[:24]
        target = self.narrative.store.root / "story-assets" / story_id / "speech" / f"{turn_id}-{key}.wav"
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and target.stat().st_size > 44:
            return FileResponse(target, media_type="audio/wav",
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
        if self.lock.locked():
            raise HTTPException(409, "El motor Piper ya está sintetizando otra voz")
        await self.lock.acquire()
        try:
            if not target.is_file() or target.stat().st_size <= 44:
                tmp = target.with_suffix(".wav.part")
                try:
                    process = await asyncio.create_subprocess_exec(
                        executable, "--model", str(model), "--output_file", str(tmp),
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.PIPE)
                    try:
                        _, stderr = await asyncio.wait_for(
                            process.communicate((text + "\n").encode("utf-8")), timeout=120)
                    except asyncio.TimeoutError:
                        process.kill()
                        await process.communicate()
                        raise HTTPException(504, "Piper superó el tiempo máximo de síntesis")
                    if process.returncode != 0 or not tmp.is_file():
                        raise HTTPException(502, "Piper no pudo sintetizar el audio: " +
                            stderr.decode("utf-8", errors="replace")[:180])
                    # Reject incomplete WAV instead of publishing a corrupt audio.
                    with tmp.open("rb") as audio:
                        if audio.read(4) != b"RIFF" or tmp.stat().st_size <= 44:
                            raise HTTPException(502, "Piper devolvió un WAV inválido")
                    tmp.replace(target)
                finally:
                    tmp.unlink(missing_ok=True)
            return FileResponse(target, media_type="audio/wav",
                 headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
        finally:
            self.lock.release()


def mount_speech_routes(app, speech: SpeechService):
    @app.get("/api/v1/tts/config")
    def get_voice_preferences():
        return speech.preferences()

    @app.put("/api/v1/tts/config")
    def save_voice_preferences(body: SpeechPreferences):
        return speech.set_preferences(body)

    @app.get("/api/v1/tts/voices")
    def voices():
        return speech.voices()

    @app.post("/api/v1/stories/{story_id}/turns/{turn_id}/speech")
    async def synthesize(story_id: uuid.UUID, turn_id: uuid.UUID, body: SpeechRequest):
        return await speech.synthesize(str(story_id), str(turn_id), body)
