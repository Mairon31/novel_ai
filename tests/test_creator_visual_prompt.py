"""Canonical Creator DNA only affects image prompts for selected story-owned NPCs."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


class CanonicalVisualPromptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cm = TestClient(create_app(Path(self.tmp.name)))
        self.client = self.cm.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "Biblioteca lunar",
            "premise": "El castillo alberga un antiguo observatorio.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.base = "/api/v1/stories/" + self.story

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def creator(self, name, tags, visual_character_id=None):
        payload = {
            "name": name,
            "description": "Un personaje que vive entre las torres del castillo.",
            "visual_dna": {"tags": tags, "seed": 123, "lora_name": "a.safetensors"},
        }
        if visual_character_id is not None:
            payload["visual_character_id"] = visual_character_id
        result = self.client.post(self.base + "/creator/characters", json=payload)
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def preview(self, prompt):
        response = self.client.post(self.base + "/scene-plan/preview",
                                    json={"prompt": prompt})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["inference_used"])
        return response.json()["prompt"]

    def test_unplanned_npcs_need_exact_name_and_dont_leak_from_other_stories(self):
        self.creator("Aira", ["cabello plateado", "capa azul"])
        self.creator("Bel", ["cicatriz dorada"])
        outside = self.client.post("/api/v1/stories", json={
            "title": "Otro mundo",
            "premise": "Una historia sin conexión con la primera.",
        }).json()["id"]
        alien = self.client.post(f"/api/v1/stories/{outside}/creator/characters", json={
            "name": "Cora",
            "description": "Una investigadora solitaria de otro reino.",
            "visual_dna": {"tags": ["sombrero rojo mágico"]},
        })
        self.assertEqual(alien.status_code, 201, alien.text)
        selected = self.preview("Aira abre el portal de la biblioteca")
        self.assertIn("cabello plateado", selected)
        self.assertNotIn("cicatriz dorada", selected)
        self.assertNotIn("sombrero rojo mágico", selected)
        self.assertNotIn("a.safetensors", selected)
        not_selected = self.preview("Jaira observa el bosque silencioso")
        self.assertNotIn("cabello plateado", not_selected)
        self.assertNotIn("sombrero rojo mágico", not_selected)
        self.assertNotIn("Identidad visual", not_selected)

    def test_saved_cast_accepts_only_explicitly_linked_character_ids(self):
        visual = self.client.post(self.base + "/visual-characters", json={
            "name": "Aira", "appearance": "Una joven de expresión serena.",
            "outfit": "Capa larga de viaje", "distinguishing_features": "Pendientes pequeños",
        })
        self.assertEqual(visual.status_code, 201, visual.text)
        aid = visual.json()["id"]
        self.creator("Aira", ["cabello blanco puro"], visual_character_id=aid)
        self.creator("Bel", ["cicatriz violeta"])
        saved = self.client.put(self.base + "/scene-plan", json={
            "visible_character_ids": [aid], "shot": "medium",
            "lighting": "natural",
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        text = self.preview("Una biblioteca iluminada por velas antiguas")
        self.assertIn("cabello blanco puro", text)
        self.assertNotIn("cicatriz violeta", text)
        none = self.client.put(self.base + "/scene-plan", json={
            "visible_character_ids": [], "shot": "medium",
            "lighting": "natural",
        })
        self.assertEqual(none.status_code, 200, none.text)
        text = self.preview("Aira y Bel entran en la biblioteca")
        self.assertNotIn("cabello blanco puro", text)
        self.assertNotIn("cicatriz violeta", text)

    def test_unlinked_matching_names_do_not_override_explicit_cast(self):
        visual = self.client.post(self.base + "/visual-characters", json={
            "name": "Aira", "appearance": "Una guerrera de ojos claros.",
        })
        self.assertEqual(visual.status_code, 201, visual.text)
        self.creator("Aira", ["corona negra antigua"])  # no visual_character_id
        plan = self.client.put(self.base + "/scene-plan", json={
            "visible_character_ids": [visual.json()["id"]], "shot": "medium",
            "lighting": "natural",
        })
        self.assertEqual(plan.status_code, 200, plan.text)
        self.assertNotIn("corona negra antigua",
                         self.preview("Aira observa la biblioteca encantada"))


if __name__ == "__main__":
    unittest.main()
