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

    def test_regenerate_only_openings_preserves_all_other_fields(self):
        self.fake()
        async def generate(config, messages):
            yield json.dumps({"openings": [
                "{{user}} ve una señal nueva en el faro y recibe una carta con una advertencia sobre el puerto y sus secretos.",
                "{{user}} encuentra la puerta del muelle abierta mientras alguien toca la campana y el mar permanece quieto.",
                "{{user}} observa la torre en silencio cuando una voz desconocida menciona la llave y un nombre olvidado.",
            ]})
        self.app.state.narrative.generate = generate
        draft = {**CORE, "protagonist_name": "Luna",
                 "characters": CAST["characters"], "lore": LORE["lore"]}
        response = self.client.post("/api/v1/creator/assistant/regenerate",
            json={"draft": draft, "section": "openings", "instruction": "Más misterio"})
        self.assertEqual(response.status_code, 200, response.text)
        updated = response.json()["draft"]
        self.assertNotEqual(updated["openings"], draft["openings"])
        for key in draft:
            if key != "openings":
                self.assertEqual(updated[key], draft[key])
        self.assertFalse(response.json()["saved"])
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_regenerate_invalid_section_and_bad_output_do_not_save(self):
        self.fake()
        draft = {**CORE, "protagonist_name": "Luna",
                 "characters": CAST["characters"], "lore": LORE["lore"]}
        invalid = self.client.post("/api/v1/creator/assistant/regenerate",
            json={"draft": draft, "section": "everything", "instruction": ""})
        self.assertEqual(invalid.status_code, 422)
        async def bad(config, messages):
            yield '{"characters": []}'
        self.app.state.narrative.generate = bad
        result = self.client.post("/api/v1/creator/assistant/regenerate",
            json={"draft": draft, "section": "characters", "instruction": ""})
        self.assertEqual(result.status_code, 422, result.text)
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_regenerate_lore_keeps_cast_and_story_untouched(self):
        self.fake()
        async def generate(config, messages):
            yield json.dumps({"lore": [
                {"title": "Nuevo faro", "content": "El faro guarda recuerdos antiguos y protege la ciudad de la tormenta que detuvo la marea.", "keys": ["faro"]},
                {"title": "La llave", "content": "La llave abre la torre cuando la campana deja de sonar y las mareas se detienen.", "keys": ["llave"]},
                {"title": "El sello", "content": "El sello conserva la historia de las familias del puerto y puede romperse con ayuda del guardián.", "keys": ["sello"]},
            ]})
        self.app.state.narrative.generate = generate
        draft = {**CORE, "protagonist_name": "Luna",
                 "characters": CAST["characters"], "lore": LORE["lore"]}
        response = self.client.post("/api/v1/creator/assistant/regenerate",
            json={"draft": draft, "section": "lore", "instruction": ""})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["draft"]["characters"], draft["characters"])
        self.assertEqual(response.json()["draft"]["ai_plot"], draft["ai_plot"])
        self.assertEqual(response.json()["draft"]["lore"][0]["title"], "Nuevo faro")

    def test_regenerate_plot_preserves_author_cast_lore_openings_and_metadata(self):
        self.fake()
        original = {**CORE, "protagonist_name": "Luna",
                    "characters": CAST["characters"], "lore": LORE["lore"]}
        observed = []
        revision = {
            "synopsis": "Una nueva conspiración oculta el verdadero origen de las campanas del puerto.",
            "player_plot": "El puerto descubre señales nuevas bajo el muelle. Los recuerdos se convierten en una pista que lleva al protagonista a una torre olvidada.",
            "ai_plot": "La fundadora de la ciudad alteró deliberadamente el orden de las mareas para proteger a los habitantes. La alcaldesa descubrió la verdad y pretende conservar el mecanismo. Cuando se rompa el pacto, cada personaje tendrá una consecuencia distinta.",
            "guidelines": "Mantén el misterio y la autonomía de {{user}}. Los NPC respetan su historia y revelan pistas en orden, sin dictar decisiones ni diálogos del protagonista.",
            "reminder": "La verdad sobre las mareas solo se conoce en el faro antiguo.",
        }
        async def generate(config, messages):
            observed.extend(messages)
            yield json.dumps(revision, ensure_ascii=False)
        self.app.state.narrative.generate = generate
        result = self.client.post("/api/v1/creator/assistant/regenerate", json={
            "draft": original, "section": "plot",
            "instruction": "Haz más sólido el misterio sin cambiar a Aria ni al farero."})
        self.assertEqual(result.status_code, 200, result.text)
        changed = result.json()["draft"]
        for field, value in revision.items():
            self.assertEqual(changed[field], value)
        for field in original:
            if field not in revision:
                self.assertEqual(changed[field], original[field], field)
        self.assertIn("Aria", observed[1]["content"])
        self.assertIn("CURRENT PLOT YOU MAY REWRITE", observed[1]["content"])
        budget = result.json()["generation_budget"]
        self.assertTrue(budget["estimate_only"])
        self.assertEqual(budget["max_output_tokens"], 3072)
        self.assertGreater(budget["input_tokens_estimate"], 0)
        self.assertFalse(result.json()["saved"])
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_regenerate_plot_rejects_partial_output_without_changing_story(self):
        self.fake()
        original = {**CORE, "protagonist_name": "Luna",
                    "characters": CAST["characters"], "lore": LORE["lore"]}
        async def generate(config, messages):
            yield json.dumps({"ai_plot": "Solo una trama sin otros campos."})
        self.app.state.narrative.generate = generate
        result = self.client.post("/api/v1/creator/assistant/regenerate",
            json={"draft": original, "section": "plot", "instruction": ""})
        self.assertEqual(result.status_code, 422, result.text)
        self.assertFalse(self.client.get("/api/v1/stories").json()["stories"])

    def test_regeneration_context_budget_does_not_mutate_original(self):
        from noble_api.story_generator import compact_regeneration_canon
        canon = {
            "title": "Historia extensa",
            "ai_plot": "Secreto y consecuencia. " * 500,
            "player_plot": "Un mundo amplio. " * 350,
            "characters": [dict(name="Aria", description="Rasgo " * 800,
                                personality="Secreto " * 300)],
            "lore": [dict(title="Ciudad", content="Historia " * 900)],
        }
        original = json.dumps(canon, ensure_ascii=False)
        result = compact_regeneration_canon(canon, max_chars=2500)
        self.assertLessEqual(len(json.dumps(result, ensure_ascii=False)), 2500)
        self.assertEqual(json.dumps(canon, ensure_ascii=False), original)
        self.assertEqual(result["title"], "Historia extensa")

    def test_regeneration_context_budget_rejects_oversized_immutable_field(self):
        from noble_api.story_generator import compact_regeneration_canon
        with self.assertRaises(ValueError):
            compact_regeneration_canon({"title": "X" * 2000}, max_chars=500)

    def test_json_parser_rejects_partial_and_array(self):
        self.assertEqual(parse_json('{"x": 1}'), {"x": 1})
        self.assertEqual(parse_json(chr(96)*3+'json\n{"x": 1}\n'+chr(96)*3), {"x": 1})
        for value in ('{"broken":', "[1]"):
            with self.assertRaises(ValueError):
                parse_json(value)


if __name__ == "__main__":
    unittest.main()
