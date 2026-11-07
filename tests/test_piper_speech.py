"""Piper opt-in contract with real WAV parsing and a fake executable.

The fake executable does not synthesize speech; it proves the CLI invocation,
cache, path validation, and no implicit invocation during 50 turns.
"""
import io
import json
import os
import sys
import tempfile
import unittest
import uuid
import wave
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app  # noqa: E402


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.app=create_app(self.root)
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        self.story=self.client.post("/api/v1/stories",json={
            "title":"Jardín oculto", "premise":"Una bibliotecaria encuentra un jardín escondido."}).json()["id"]
        self.voice_dir=self.root/"models"/"voices"
        self.voice_dir.mkdir(exist_ok=True)
        self.voice=self.voice_dir/"latam-test.onnx"
        self.voice.write_bytes(b"Fake model for contract testing")
        (self.voice_dir/"latam-test.onnx.json").write_text('{"language":{"code":"es_MX"}}')
        self.fake=self.root/"piper-test"
        self.counter=self.root/"calls.txt"
        self.fake.write_text(
            "#!/usr/bin/env python3\n"
            "import sys, pathlib, wave, json\n"
            "args=sys.argv\n"
            "model=pathlib.Path(args[args.index('--model')+1])\n"
            "output=pathlib.Path(args[args.index('--output_file')+1])\n"
            "counter=model.parent.parent.parent/'calls.txt'\n"
            "(model.parent.parent.parent/'last-piper-args.json').write_text(json.dumps(args))\n"
            "counter.write_text(counter.read_text()+'1' if counter.exists() else '1')\n"
            "text=sys.stdin.read()\n"
            "with wave.open(str(output),'wb') as wav:\n"
            " wav.setnchannels(1)\n"
            " wav.setsampwidth(2)\n"
            " wav.setframerate(22050)\n"
            " wav.writeframes(b'\\x00\\x00'*2205)\n")
        self.fake.chmod(0o755)

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.tmp.cleanup()

    def new_turn(self):
        req=str(uuid.uuid4())
        row=self.app.state.narrative.append(self.story,req,"continue","",
            "La bibliotecaria encuentra un sendero cubierto de flores.","fake-llm")
        return row["id"]

    def url(self,turn):
        return f"/api/v1/stories/{self.story}/turns/{turn}/speech"

    def test_no_audio_generation_during_narration_or_browsing(self):
        # Writing turns does not ever import or launch Piper.
        for _ in range(50):
            self.new_turn()
        self.client.get("/api/v1/stories/"+self.story+"/turns")
        with patch("noble_api.speech.shutil.which",return_value=str(self.fake)):
            voices=self.client.get("/api/v1/tts/voices")
            self.assertEqual(len(voices.json()["voices"]),1)
        self.assertFalse(self.counter.exists())
        denied=self.client.post(self.url(self.new_turn()),
            json={"voice_id":self.voice.name,"request_source":"listen_button"})
        self.assertEqual(denied.status_code,403)
        self.assertFalse(self.counter.exists())

    def test_default_voice_preference_persists_and_requires_installed_voice(self):
        initial=self.client.get("/api/v1/tts/config")
        self.assertEqual(initial.status_code,200)
        self.assertEqual(initial.json()["default_voice_id"],"")
        selected=self.client.put("/api/v1/tts/config",
            json={"default_voice_id":self.voice.name})
        self.assertEqual(selected.status_code,200,selected.text)
        self.assertEqual(self.client.get("/api/v1/tts/config").json()["default_voice_id"],
                         self.voice.name)
        missing=self.client.put("/api/v1/tts/config",
            json={"default_voice_id":"missing.onnx"})
        self.assertEqual(missing.status_code,422)
        self.assertEqual(self.client.get("/api/v1/tts/config").json()["default_voice_id"],
                         self.voice.name)
        reset=self.client.put("/api/v1/tts/config",json={"default_voice_id":""})
        self.assertEqual(reset.status_code,200)
        self.assertEqual(reset.json()["default_voice_id"],"")
        self.assertFalse(self.counter.exists())

    def test_explicit_voice_preview_returns_wav_and_discards_temporary_audio(self):
        self.assertFalse(self.counter.exists())
        with patch("noble_api.speech.shutil.which", return_value=str(self.fake)):
            sample = self.client.post("/api/v1/tts/preview", json={
                "voice_id": self.voice.name,
                "text": "Hola, esta es una prueba de voz latinoamericana.",
                "request_source": "preview_button",
            })
        self.assertEqual(sample.status_code, 200, sample.text)
        self.assertEqual(sample.headers["content-type"], "audio/wav")
        self.assertEqual(sample.headers["cache-control"], "no-store")
        with wave.open(io.BytesIO(sample.content), "rb") as wav:
            self.assertEqual(wav.getframerate(), 22050)
            self.assertGreater(wav.getnframes(), 0)
        self.assertEqual(self.counter.read_text(), "1")
        self.assertFalse(list(self.voice_dir.glob(".noble-piper-test-*")))
        self.assertFalse((self.root / "story-assets" / self.story / "speech").exists())

    def test_preview_requires_explicit_button_source_and_installed_engine(self):
        attempt = {"voice_id": self.voice.name,
                   "text": "Hola, esta es una prueba de voz.",
                   "request_source": "auto_narration"}
        with patch("noble_api.speech.shutil.which", return_value=str(self.fake)):
            denied = self.client.post("/api/v1/tts/preview", json=attempt)
        self.assertEqual(denied.status_code, 422)
        with patch("noble_api.speech.shutil.which", return_value=None):
            missing = self.client.post("/api/v1/tts/preview",
                json={**attempt, "request_source": "preview_button"})
        self.assertEqual(missing.status_code, 503)
        self.assertEqual(self.client.post("/api/v1/tts/preview", json={
            **attempt, "text": "abc", "request_source": "preview_button",
        }).status_code, 422)
        self.assertFalse(self.counter.exists())

    def test_explicit_piper_audio_and_cache(self):
        turn=self.new_turn()
        enabled=self.client.patch("/api/v1/settings",json={"tts_enabled":True})
        self.assertEqual(enabled.status_code,200)
        with patch("noble_api.speech.shutil.which",return_value=str(self.fake)):
            first=self.client.post(self.url(turn),json={
                "voice_id":self.voice.name, "request_source":"listen_button"})
            self.assertEqual(first.status_code,200,first.text)
            self.assertEqual(first.headers["content-type"],"audio/wav")
            with wave.open(io.BytesIO(first.content),"rb") as decoded:
                self.assertEqual(decoded.getnchannels(),1)
                self.assertEqual(decoded.getframerate(),22050)
            second=self.client.post(self.url(turn),json={
                "voice_id":self.voice.name, "request_source":"listen_button"})
            self.assertEqual(second.status_code,200)
            self.assertEqual(second.content,first.content)
        self.assertEqual(self.counter.read_text(),"1")

    def test_piper_synthesis_parameters_apply_to_preview_and_invalidate_audio_cache(self):
        endpoint = "/api/v1/tts/synthesis-config"
        defaults = self.client.get(endpoint)
        self.assertEqual(defaults.status_code, 200)
        self.assertEqual(defaults.json(), {
            "length_scale": 1.0, "noise_scale": 0.667, "noise_w": 0.8})
        self.client.patch("/api/v1/settings", json={"tts_enabled": True})
        turn = self.new_turn()
        with patch("noble_api.speech.shutil.which", return_value=str(self.fake)):
            first = self.client.post(self.url(turn), json={
                "voice_id": self.voice.name, "request_source": "listen_button"})
            self.assertEqual(first.status_code, 200, first.text)
            first_args = json.loads((self.root / "last-piper-args.json").read_text())
            self.assertEqual(first_args[first_args.index("--length_scale") + 1], "1.0")
            self.assertEqual(first_args[first_args.index("--noise_scale") + 1], "0.667")
            saved = self.client.put(endpoint, json={
                "length_scale": 0.85, "noise_scale": 0.75, "noise_w": 0.95})
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(self.client.get(endpoint).json()["length_scale"], 0.85)
            preview = self.client.post("/api/v1/tts/preview", json={
                "voice_id": self.voice.name,
                "text": "Esta voz ahora tiene otra velocidad y variación.",
                "request_source": "preview_button"})
            self.assertEqual(preview.status_code, 200, preview.text)
            preview_args = json.loads((self.root / "last-piper-args.json").read_text())
            self.assertEqual(preview_args[preview_args.index("--length_scale") + 1], "0.85")
            self.assertEqual(preview_args[preview_args.index("--noise_scale") + 1], "0.75")
            self.assertEqual(preview_args[preview_args.index("--noise_w") + 1], "0.95")
            changed = self.client.post(self.url(turn), json={
                "voice_id": self.voice.name, "request_source": "listen_button"})
            self.assertEqual(changed.status_code, 200, changed.text)
            again = self.client.post(self.url(turn), json={
                "voice_id": self.voice.name, "request_source": "listen_button"})
            self.assertEqual(again.status_code, 200)
        self.assertEqual(self.counter.read_text(), "111")
        self.assertFalse(list(self.voice_dir.glob(".noble-piper-test-*")))
        output_files = list((self.root / "story-assets" / self.story / "speech").glob("*.wav"))
        self.assertEqual(len(output_files), 2, "Each saved configuration requires its own cached WAV")

    def test_invalid_piper_synthesis_settings_do_not_overwrite_valid_config(self):
        endpoint = "/api/v1/tts/synthesis-config"
        before = self.client.get(endpoint).json()
        for override in [
            {"length_scale": 0.1}, {"length_scale": 3.0},
            {"noise_scale": -1}, {"noise_w": 4.0},
            {"unrecognized_engine_setting": 42},
        ]:
            rejected = self.client.put(endpoint, json={**before, **override})
            self.assertEqual(rejected.status_code, 422, (override, rejected.text))
            self.assertEqual(self.client.get(endpoint).json(), before)
        self.assertFalse(self.counter.exists())

    def test_missing_engine_and_request_validation(self):
        turn=self.new_turn()
        self.client.patch("/api/v1/settings",json={"tts_enabled":True})
        with patch("noble_api.speech.shutil.which",return_value=None):
            no_engine=self.client.post(self.url(turn),json={
                "voice_id":self.voice.name,"request_source":"listen_button"})
            self.assertEqual(no_engine.status_code,503)
        bad=self.client.post(self.url(turn),json={
            "voice_id":"../latam-test.onnx","request_source":"listen_button"})
        self.assertEqual(bad.status_code,422)
        implicit=self.client.post(self.url(turn),json={
            "voice_id":self.voice.name,"request_source":"user_enabled_autoread"})
        self.assertEqual(implicit.status_code,422)
        missing=self.client.post(self.url(str(uuid.uuid4())),json={
            "voice_id":self.voice.name,"request_source":"listen_button"})
        self.assertEqual(missing.status_code,404)
        self.assertFalse(self.counter.exists())


if __name__=="__main__":
    unittest.main()
