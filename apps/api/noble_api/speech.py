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
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, ConfigDict

from .narrative import NarrativeService


class SpeechPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_voice_id: str = Field(default="", max_length=180)


class PiperSynthesisConfig(BaseModel):
    """Provider-specific controls supported by both Piper CLI implementations."""
    model_config = ConfigDict(extra="forbid")
    length_scale: float = Field(default=1.0, ge=0.5, le=2.0, allow_inf_nan=False)
    noise_scale: float = Field(default=0.667, ge=0, le=1.5, allow_inf_nan=False)
    noise_w: float = Field(default=0.8, ge=0, le=1.5, allow_inf_nan=False)


def piper_cli_options(settings: dict) -> list[str]:
    return ["--length_scale", str(settings["length_scale"]),
            "--noise_scale", str(settings["noise_scale"]),
            "--noise_w", str(settings["noise_w"])]


class SpeechRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=180)
    request_source: str = "listen_button"


class VoicePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice_id: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=10, max_length=400)
    request_source: str = "preview_button"


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
            conn.execute("""CREATE TABLE IF NOT EXISTS piper_synthesis_config(
                id INTEGER PRIMARY KEY CHECK(id=1), config_json TEXT NOT NULL
            )""")
            conn.execute("INSERT OR IGNORE INTO piper_synthesis_config VALUES(1,?)",
                         (PiperSynthesisConfig().model_dump_json(),))

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

    def synthesis_config(self) -> dict:
        with self.narrative.store._conn() as db:
            row = db.execute("SELECT config_json FROM piper_synthesis_config WHERE id=1").fetchone()
        return PiperSynthesisConfig.model_validate_json(
            row["config_json"]).model_dump() if row else PiperSynthesisConfig().model_dump()

    def set_synthesis_config(self, data: PiperSynthesisConfig) -> dict:
        with self.narrative.store._conn() as db:
            db.execute("UPDATE piper_synthesis_config SET config_json=? WHERE id=1",
                       (data.model_dump_json(),))
        return self.synthesis_config()

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
            raise HTTPException(422, "Invalid voice name")
        target = self.root / voice_id
        if not target.is_file() or target.is_symlink():
            raise HTTPException(422, "Piper voice is not installed")
        sidecar = Path(str(target) + ".json")
        if not sidecar.is_file() or sidecar.is_symlink():
            raise HTTPException(422, "Piper voice JSON configuration is missing")
        return target

    async def preview(self, body: VoicePreviewRequest) -> Response:
        """Synthesize an explicitly requested short sample without saving it."""
        if body.request_source != "preview_button" or not body.text.strip():
            raise HTTPException(422, "Voice preview requires an explicit request and text")
        model = self.voice_path(body.voice_id)
        synthesis = self.synthesis_config()
        executable = shutil.which("piper")
        if not executable:
            raise HTTPException(503, "Piper is not installed on PATH")
        if self.lock.locked():
            raise HTTPException(409, "Piper engine is busy")
        await self.lock.acquire()
        try:
            with tempfile.TemporaryDirectory(prefix=".noble-piper-test-", dir=self.root) as directory:
                target = Path(directory) / "sample.wav"
                process = await asyncio.create_subprocess_exec(
                    executable, "--model", str(model), "--output_file", str(target),
                    *piper_cli_options(synthesis),
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE)
                try:
                    _, stderr = await asyncio.wait_for(
                        process.communicate((body.text.strip() + "\n").encode("utf-8")),
                        timeout=60)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.communicate()
                    raise HTTPException(504, "Piper voice preview timed out")
                if process.returncode != 0 or not target.is_file():
                    raise HTTPException(502, "Piper could not generate the preview: " +
                                        stderr.decode("utf-8", errors="replace")[:160])
                if not 44 < target.stat().st_size <= 16 * 1024 * 1024:
                    raise HTTPException(502, "Preview WAV has an invalid size")
                data = target.read_bytes()
                if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
                    raise HTTPException(502, "Piper returned invalid WAV audio")
                return Response(data, media_type="audio/wav", headers={
                    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                })
        finally:
            self.lock.release()

    async def synthesize(self, story_id: str, turn_id: str,
                         request: SpeechRequest) -> FileResponse:
        if request.request_source != "listen_button":
            raise HTTPException(422, "Audio must be explicitly requested")
        settings = self.narrative.store.settings()
        if not settings.get("tts_enabled"):
            raise HTTPException(403, "Enable TTS in Settings to hear narration")
        if not self.narrative.get_story(story_id):
            raise HTTPException(404, "Story not found")
        with self.narrative.store._conn() as db:
            turn = db.execute("SELECT assistant_text FROM story_turns WHERE id=? AND story_id=?",
                              (turn_id, story_id)).fetchone()
        if not turn:
            raise HTTPException(404, "Requested message does not exist")
        text = str(turn["assistant_text"]).strip()
        if not text:
            raise HTTPException(422, "Message contains no text")
        if len(text) > 3500:
            raise HTTPException(413, "Text exceeds the 3,500-character per-synthesis limit")
        model = self.voice_path(request.voice_id)
        executable = shutil.which("piper")
        if not executable:
            raise HTTPException(503, "Piper is not installed on PATH")
        synthesis = self.synthesis_config()
        signature = f"{model.name}:{model.stat().st_mtime_ns}:{model.stat().st_size}"
        key = hashlib.sha256((signature + "\n" + text + "\n" +
                              json.dumps(synthesis, sort_keys=True)).encode("utf-8")).hexdigest()[:24]
        target = self.narrative.store.root / "story-assets" / story_id / "speech" / f"{turn_id}-{key}.wav"
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and target.stat().st_size > 44:
            return FileResponse(target, media_type="audio/wav",
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
        if self.lock.locked():
            raise HTTPException(409, "Piper is already synthesizing another voice")
        await self.lock.acquire()
        try:
            if not target.is_file() or target.stat().st_size <= 44:
                tmp = target.with_suffix(".wav.part")
                try:
                    process = await asyncio.create_subprocess_exec(
                        executable, "--model", str(model), "--output_file", str(tmp),
                        *piper_cli_options(synthesis),
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.PIPE)
                    try:
                        _, stderr = await asyncio.wait_for(
                            process.communicate((text + "\n").encode("utf-8")), timeout=120)
                    except asyncio.TimeoutError:
                        process.kill()
                        await process.communicate()
                        raise HTTPException(504, "Piper synthesis timed out")
                    if process.returncode != 0 or not tmp.is_file():
                        raise HTTPException(502, "Piper could not synthesize audio: " +
                            stderr.decode("utf-8", errors="replace")[:180])
                    # Reject incomplete WAV instead of publishing a corrupt audio.
                    with tmp.open("rb") as audio:
                        if audio.read(4) != b"RIFF" or tmp.stat().st_size <= 44:
                            raise HTTPException(502, "Piper returned invalid WAV audio")
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

    @app.get("/api/v1/tts/synthesis-config")
    def get_synthesis_config():
        return speech.synthesis_config()

    @app.put("/api/v1/tts/synthesis-config")
    def save_synthesis_config(body: PiperSynthesisConfig):
        return speech.set_synthesis_config(body)

    @app.get("/api/v1/tts/voices")
    def voices():
        return speech.voices()

    @app.post("/api/v1/tts/preview")
    async def preview_voice(body: VoicePreviewRequest):
        return await speech.preview(body)

    @app.post("/api/v1/stories/{story_id}/turns/{turn_id}/speech")
    async def synthesize(story_id: uuid.UUID, turn_id: uuid.UUID, body: SpeechRequest):
        return await speech.synthesize(str(story_id), str(turn_id), body)
