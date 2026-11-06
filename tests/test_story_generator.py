"""Creator AI staged generation, validation, and safe install: offline tests."""
import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app
from noble_api.story_generator import StoryGenerator, Idea, StoryDraft, parse_json

CORE = {
    "title": "El puerto de las voces",
    "synopsis": "Las campanas recuerdan a quienes desaparecieron en el puerto.",
    "player_plot": "Cada noche una campana cambia los recuerdos de una ciudad costera y alguien busca devolver las mareas.",
    "ai_plot": "La alcaldesa oculta que las campanas se alimentan de recuerdos ajenos y mantienen la marea detenida. El farero conoce el ritual original. La boticaria busca a su hermano. La ruptura del sello obligará a elegir entre memoria y seguridad.",
    "guidelines": "No decidir por {{user}}. Revelar secretos gradualmente con pistas, mantener la continuidad y respetar las consecuencias.",
    "reminder": "Las campanas alteran los recuerdos de esta ciudad.",
    "openings": [
        "{{user}} llega al muelle antes del amanecer, cuando una campana resuena desde una torre abandonada y una carta con su nombre cae sobre el embarcadero.",
        "{{user}} encuentra una llave enterrada junto al faro mientras dos voces discuten si las campanas deberían volver a sonar esta noche.",
        "{{user}} despierta en una casa vacía, donde una carta firmada por alguien olvidado aparece bajo la puerta cuando empieza a llover.",
    ],
    "genre": "Misterio", "tags": ["misterio", "costa"],
}
CAST = {"characters": [
    {"name": name,
     "description": name + " conoce la historia del puerto y guarda un secreto vinculado a la campana y el faro.",
     "personality": "Reservado, observador y leal a sus propias decisiones.",
     "dialogue_examples": "No toques la campana sin descubrir primero quién la construyó."}
    for name in ["Aria", "Dante", "Mara", "Elio"]
]}
LORE = {"lore": [
    {"title": title,
     "content": title + " tiene reglas antiguas que afectan los recuerdos, la marea detenida y a los habitantes del puerto.",
     "keys": [key]} for title, key in [
         ("El faro", "faro"), ("Las campanas", "campanas"), ("El muelle", "muelle")]
]}


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.client = TestClient(self.app)
        self.service = StoryGenerator(self.app.state.narrative)

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def fake(self, fail=0):
        calls = []
        async def generate(config, messages):
            calls.append((config, messages))
            step = len(calls)
            data = (CORE, CAST, LORE)[step-1]
            result = '{"missing":' if step == fail else json.dumps(data, ensure_ascii=False)
            for pos in range(0, len(result), 43):
                yield result[pos:pos+43]
        self.app.state.narrative.generate = generate
        self.app.state.narrative.config = lambda: {
            "model": "mock", "provider": "ollama", "device": "cpu",
            "temperature": 0.7, "max_tokens": 400,
        }
        return calls

    def test_model_required_before_drafting(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.service.draft(Idea(
                idea="Un puerto olvida su historia y las campanas guardan secretos.")))
        self.assertEqual(error.exception.status_code, 409)

    def test_generate_three_stages_then_confirm_independent_world(self):
        calls = self.fake()
        generated = asyncio.run(self.service.draft(Idea(
            idea="Un puerto olvida su historia y las campanas guardan secretos.",
            protagonist_name="Luna")))
        self.assertEqual(generated["stages_completed"], 3)
        self.assertFalse(generated["saved"])
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.client.get("/api/v1/stories").json()["stories"], [])
        response = self.client.post("/api/v1/creator/assistant/install",
                                    json=generated["draft"])
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["characters_installed"], 4)
        sid = response.json()["story"]["id"]
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{sid}/lorebook").json()["entries"]), 3)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{sid}/creator/characters").json()["characters"]), 4)
        self.assertIn("alcaldesa", self.client.get(
            f"/api/v1/stories/{sid}/creator").json()["ai_plot"])

    def test_incomplete_third_response_creates_no_story(self):
        self.fake(fail=3)
        with self.assertRaises(HTTPException) as error:
            asyncio.run(self.service.draft(Idea(
                idea="Un puerto olvida su historia y las campanas guardan secretos.")))
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_install_rejects_extras_and_empty_characters(self):
        draft = {**CORE, "protagonist_name": "Luna",
                 "characters": CAST["characters"], "lore": LORE["lore"]}
        self.assertEqual(self.client.post("/api/v1/creator/assistant/install",
            json={**draft, "unknown": True}).status_code, 422)
        self.assertEqual(self.client.post("/api/v1/creator/assistant/install",
            json={**draft, "characters": []}).status_code, 422)
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_atomic_rollback_on_character_failure(self):
        draft = StoryDraft.model_validate({**CORE, "protagonist_name": "Luna",
            "characters": CAST["characters"], "lore": LORE["lore"]})
        with self.app.state.store._conn() as db:
            db.execute("CREATE TRIGGER fail_ai BEFORE INSERT ON creator_characters "
                       "BEGIN SELECT RAISE(ABORT, 'forced'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.service.install(draft)
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_json_parser_rejects_partial_and_array(self):
        self.assertEqual(parse_json('{"x": 1}'), {"x": 1})
        self.assertEqual(parse_json(chr(96)*3+'json\n{"x": 1}\n'+chr(96)*3), {"x": 1})
        for value in ('{"broken":', "[1]"):
            with self.assertRaises(ValueError):
                parse_json(value)


if __name__ == "__main__":
    unittest.main()
