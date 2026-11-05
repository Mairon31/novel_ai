"""Lorebook CRUD, activation, context limits and branch isolation via real SQLite API."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.main import create_app


class LorebookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="noble-lorebook-")
        self.app = create_app(Path(self.tmp.name))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        story = self.client.post("/api/v1/stories", json={
            "title": "Lorebook de las ruinas",
            "premise": "Una exploradora busca pistas en un reino de magia antigua.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(story.status_code, 201, story.text)
        self.story_id = story.json()["id"]
        self.base = f"/api/v1/stories/{self.story_id}/lorebook"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def put(self, **fields):
        body = {
            "title": "Las ruinas",
            "content": "Las ruinas ocultan un mapa que nadie ha visto en siglos.",
            "keys": ["ruinas"],
            **fields,
        }
        response = self.client.post(self.base, json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def preview(self, query, budget=6000, base=None):
        response = self.client.post((base or self.base) + "/preview", json={
            "query": query, "budget_chars": budget,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_lorebook_activates_from_user_action_without_leaking_to_player(self):
        self.put()
        story = self.app.state.narrative.get_story(self.story_id)
        active = self.app.state.narrative.messages(story, "Exploro las ruinas.", "do")
        self.assertIn("Las ruinas ocultan un mapa", active[0]["content"])
        self.assertNotIn("Las ruinas ocultan un mapa", active[-1]["content"])
        other = self.app.state.narrative.messages(story, "Veo un río.", "do")
        self.assertNotIn("Las ruinas ocultan un mapa", other[0]["content"])
        self.assertEqual(len(self.preview("Examino las ruinas")["entries"]), 1)
        self.assertEqual(self.preview("Cruzo el puente")["entries"], [])

    def test_keywords_whole_word_secondary_all_and_unicode_casefold(self):
        self.put(title="Profecía", content="La profecía solo se aplica en la noche del bosque.",
                 keys=["Árbol"], secondary_keys=["noche", "bosque"],
                 secondary_mode="all")
        self.assertEqual(self.preview("Cruzo los Árboles de noche en el bosque")["entries"], [])
        self.assertEqual(self.preview("Observo un árbol cerca del bosque")["entries"], [])
        self.assertEqual(len(self.preview("El ÁRBOL brilla de NOCHE en el BOSQUE")["entries"]), 1)

    def test_always_active_disabled_and_keyword_safety(self):
        self.put(title="Brújula", content="La brújula no puede indicar la ubicación del jugador.",
                 keys=[], always_active=True, priority=100)
        self.put(title="Secreto", content="Un secreto aislado nunca debe activarse.",
                 keys=["secreto"], enabled=False)
        entries = self.preview("camino por la ciudad")["entries"]
        self.assertEqual([v["title"] for v in entries], ["Brújula"])
        forbidden = self.client.post(self.base, json={
            "title": "No debería existir", "content": "Una anotación del mundo.",
            "keys": ["(.*)+"], "regex": ".*",
        })
        self.assertEqual(forbidden.status_code, 422)
        invalid = self.client.post(self.base, json={
            "title": "Sin palabras", "content": "Una anotación del mundo.",
        })
        self.assertEqual(invalid.status_code, 422)
        dupes = self.client.post(self.base, json={
            "title": "Duplicado", "content": "Una anotación del mundo.",
            "keys": ["Bosque", "bosque"],
        })
        self.assertEqual(dupes.status_code, 422)

    def test_priority_budget_and_skips_do_not_cut_facts(self):
        self.put(title="Prioritaria", content="A" * 420, keys=["lugar"],
                 priority=100)
        self.put(title="Secundaria", content="B" * 420, keys=["lugar"],
                 priority=1)
        data = self.preview("este lugar", budget=512)
        self.assertEqual([e["title"] for e in data["entries"]], ["Prioritaria"])
        self.assertEqual(data["skipped_budget"], 1)
        self.assertLessEqual(data["used_chars"], 512)
        self.assertNotIn("B" * 25, data["context"])

    def test_saved_entry_edits_and_deletes_are_scoped_to_story(self):
        first = self.put()
        other_story = self.client.post("/api/v1/stories", json={
            "title": "Otra realidad",
            "premise": "Una viajera recorre una ciudad desconocida.",
        }).json()["id"]
        foreign_base = f"/api/v1/stories/{other_story}/lorebook"
        changed = self.client.put(foreign_base + "/" + first["id"], json={
            "title": "Intruso", "content": "Este texto no debe escribirse.",
            "keys": ["intruso"],
        })
        self.assertEqual(changed.status_code, 422)
        forbidden_delete = self.client.delete(foreign_base + "/" + first["id"])
        self.assertEqual(forbidden_delete.status_code, 404)
        self.assertEqual(self.preview("ruinas", base=foreign_base)["entries"], [])
        updated = self.client.put(self.base + "/" + first["id"], json={
            "title": "Ruinas renovadas", "content": "La profecía cambió tras la tormenta.",
            "keys": ["ruinas"],
        })
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["id"], first["id"])
        self.assertIn("tormenta", self.preview("ruinas")["context"])
        removed = self.client.delete(self.base + "/" + first["id"])
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(self.preview("ruinas")["entries"], [])

    def test_branch_inherits_independent_lorebook_and_replaces_user_placeholder(self):
        original = self.put(title="Guardiana", keys=["guardiana"],
                            content="La guardiana solo confía en {{user}} y los animales.")
        branch = self.client.post(
            f"/api/v1/stories/{self.story_id}/fork",
            json={"until_turn_id": None},
        )
        self.assertEqual(branch.status_code, 201, branch.text)
        branch_id = branch.json()["id"]
        branch_base = f"/api/v1/stories/{branch_id}/lorebook"
        inherited = self.client.get(branch_base)
        self.assertEqual(inherited.status_code, 200)
        self.assertEqual(len(inherited.json()["entries"]), 1)
        copied = inherited.json()["entries"][0]
        self.assertNotEqual(copied["id"], original["id"])
        self.assertEqual(copied["content"], original["content"])
        self.assertIn("Luna", self.preview("la guardiana")["context"])
        edited = self.client.put(branch_base + "/" + copied["id"], json={
            "title": "Otra guardiana",
            "content": "Ahora la guardiana protege una llave misteriosa.",
            "keys": ["guardiana"],
        })
        self.assertEqual(edited.status_code, 200)
        self.assertNotIn("llave misteriosa", self.preview("guardiana")["context"])
        self.assertIn("llave misteriosa",
                      self.preview("guardiana", base=branch_base)["context"])

    def test_restart_preserves_lorebook_and_context_is_author_only(self):
        self.put(title="Llave secreta", keys=["llave"],
                 content="La llave abre la bóveda prohibida del archimago.")
        restarted = create_app(Path(self.tmp.name))
        with TestClient(restarted) as client:
            response = client.get(self.base)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()["entries"]), 1)
            story = restarted.state.narrative.get_story(self.story_id)
            messages = restarted.state.narrative.messages(story, "Tomo la llave.", "do")
            self.assertIn("bóveda prohibida", messages[0]["content"])
            self.assertNotIn("bóveda prohibida", messages[-1]["content"])

    def test_author_only_blueprint_does_not_trigger_lorebook_entries(self):
        self.put(title="Prohibido", content="El rey desapareció sin dejar rastro.",
                 keys=["castillo"])
        self.client.put(f"/api/v1/stories/{self.story_id}/creator", json={
            "ai_plot": "La trama secreta sucede en un castillo.",
        })
        story = self.app.state.narrative.get_story(self.story_id)
        messages = self.app.state.narrative.messages(story, "Camino por el puerto.", "do")
        self.assertNotIn("El rey desapareció", messages[0]["content"])
        self.assertIn("La trama secreta", messages[0]["content"])


if __name__ == "__main__":
    unittest.main()
