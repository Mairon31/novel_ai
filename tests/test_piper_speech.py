"""Piper opt-in contract with real WAV parsing and a fake executable.

The fake executable does not synthesize speech; it proves the CLI invocation,
cache, path validation, and no implicit invocation during 50 turns.
"""
import io
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
            "import sys, pathlib, wave\n"
            "args=sys.argv\n"
            "model=pathlib.Path(args[args.index('--model')+1])\n"
            "output=pathlib.Path(args[args.index('--output_file')+1])\n"
            "counter=model.parent.parent.parent/'calls.txt'\n"
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
