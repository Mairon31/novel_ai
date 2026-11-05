"""Real API contracts for separated author/player story information.

No LLM is required. Verify the narrator receives author-only context while
the player's actual action remains the final user message.
"""
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app


class CreatorStudioTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.app=create_app(Path(self.tmp.name))
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        created=self.client.post("/api/v1/stories",json={
            "title":"La rosa de cristal",
            "premise":"Una bruja viaja a una ciudad donde desaparecen las estrellas.",
            "protagonist_name":"Luna"})
        self.assertEqual(created.status_code,201)
        self.story=created.json()["id"]
        self.base=f"/api/v1/stories/{self.story}"

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.tmp.cleanup()

    def test_world_bible_guidance_and_player_action_are_distinct(self):
        saved=self.client.put(self.base+"/creator",json={
            "synopsis":"Una ciudad que olvida sus propios sueños.",
            "player_plot":"La aventura comienza en una posada tranquila.",
            "ai_plot":"El alcalde oculta una máquina que roba las estrellas.",
            "guidelines":"Los NPC reaccionan sin controlar a {{user}}.",
            "reminder":"Recuerda que la luna no puede hablar.",
            "opening_scenarios":["{{user}} despierta en una posada y escucha cantar a los pájaros."],
            "genre":"Fantasía", "tags":["isekai","magia"],"language":"es-419"})
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(saved.json()["tags"],["isekai","magia"])
        npc=self.client.post(self.base+"/creator/characters",json={
            "name":"Aira","description":"Una bibliotecaria joven que protege los libros prohibidos.",
            "personality":"Curiosa pero cautelosa.",
            "dialogue_examples":"Aira: No cierres ese libro todavía.",
            "voice_id":""})
        self.assertEqual(npc.status_code,201,npc.text)
        world=self.app.state.narrative.get_story(self.story)
        messages=self.app.state.narrative.messages(world,"Abro la puerta secreta.","do")
        system=messages[0]["content"]
        self.assertIn("El alcalde oculta",system)
        self.assertIn("Los NPC reaccionan sin controlar a Luna.",system)
        self.assertIn("la luna no puede hablar",system)
        self.assertIn("Aira: No cierres",system)
        self.assertIn("es-419",system)
        self.assertNotIn("La aventura comienza en una posada tranquila.",system)
        self.assertEqual(messages[-1]["role"],"user")
        self.assertIn("Abro la puerta secreta.",messages[-1]["content"])
        self.assertNotIn("Idioma de salida obligatorio",messages[-1]["content"])

    def test_opening_is_authored_and_idempotently_protected(self):
        invalid=self.client.post(self.base+"/creator/opening",json={"index":0})
        self.assertEqual(invalid.status_code,422)
        self.client.put(self.base+"/creator",json={
            "opening_scenarios":["{{user}} despierta en un dormitorio y escucha pasos."],
        })
        opening=self.client.post(self.base+"/creator/opening",json={"index":0})
        self.assertEqual(opening.status_code,201,opening.text)
        self.assertIn("Luna despierta",opening.json()["assistant_text"])
        self.assertEqual(opening.json()["model"],"inicio-del-creador")
        second=self.client.post(self.base+"/creator/opening",json={"index":0})
        self.assertEqual(second.status_code,422)
        turns=self.client.get(self.base+"/turns")
        self.assertEqual(len(turns.json()["turns"]),1)

    def test_validation_visual_ownership_and_branch_copy(self):
        bad=self.client.put(self.base+"/creator",json={"language":"und"})
        self.assertEqual(bad.status_code,422)
        dupe=self.client.put(self.base+"/creator",json={"tags":["magia","magia"]})
        self.assertEqual(dupe.status_code,422)
        foreign=self.client.post(self.base+"/creator/characters",json={
            "name":"Celia","description":"Ella protege el bosque de los vientos.",
            "visual_character_id":"6b9c7681-8a04-42f7-87bb-d67945b12358"})
        self.assertEqual(foreign.status_code,422)
        blueprint=self.client.put(self.base+"/creator",json={
            "ai_plot":"La ciudad tiene secretos que deben permanecer en silencio.",
            "genre":"Misterio"})
        self.assertEqual(blueprint.status_code,200)
        npc=self.client.post(self.base+"/creator/characters",json={
            "name":"Aira","description":"La guardiana de la biblioteca principal de la ciudad."})
        self.assertEqual(npc.status_code,201)
        fork=self.client.post(self.base+"/fork",json={})
        self.assertEqual(fork.status_code,201,fork.text)
        branch=fork.json()["id"]
        clone=self.client.get(f"/api/v1/stories/{branch}/creator")
        self.assertEqual(clone.json()["ai_plot"],"La ciudad tiene secretos que deben permanecer en silencio.")
        cast=self.client.get(f"/api/v1/stories/{branch}/creator/characters")
        self.assertEqual(len(cast.json()["characters"]),1)
        self.assertNotEqual(cast.json()["characters"][0]["id"],npc.json()["id"])
        self.assertEqual(cast.json()["characters"][0]["name"],"Aira")
        updated=self.client.put(f"/api/v1/stories/{branch}/creator",json={
            "ai_plot":"La ciudad ahora tiene nuevas reglas."})
        self.assertEqual(updated.status_code,200)
        self.assertIn("secretos",self.client.get(self.base+"/creator").json()["ai_plot"])

    def test_creator_survives_api_restart(self):
        self.client.put(self.base+"/creator",json={
            "ai_plot":"Todo sucede en un templo antiguo."})
        app=create_app(Path(self.tmp.name))
        with TestClient(app) as client:
            loaded=client.get(self.base+"/creator")
            self.assertEqual(loaded.status_code,200)
            self.assertIn("templo antiguo",loaded.json()["ai_plot"])


if __name__=="__main__":
    unittest.main()
