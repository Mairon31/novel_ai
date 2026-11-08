"""Lorebook audience isolation: only confirmed, present NPC witnesses may activate private lore."""
from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app


class LorebookWitnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-witness-lore-")
        self.app = create_app(Path(self.temp.name))
        self.session = TestClient(self.app)
        self.client = self.session.__enter__()
        response = self.client.post("/api/v1/stories", json={
            "title": "El sello prohibido",
            "premise": "Dos personajes viajan por un reino de ruinas.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.story = response.json()["id"]
        self.lore_url = f"/api/v1/stories/{self.story}/lorebook"
        self.world_url = f"/api/v1/stories/{self.story}/world-state"
        self.aira = self.npc(self.story, "Aira")
        self.beto = self.npc(self.story, "Beto")

    def tearDown(self):
        self.session.__exit__(None, None, None)
        self.temp.cleanup()

    def npc(self, story, name):
        response = self.client.post(f"/api/v1/stories/{story}/creator/characters", json={
            "name": name,
            "description": f"{name} vigila el mercado y conoce los caminos del reino.",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def add(self, **overrides):
        data = {
            "title": "Sello antiguo",
            "content": "La llave del sello antiguo está bajo la torre del norte.",
            "keys": ["sello"],
            "visibility": "witnesses",
            "witness_character_ids": [self.aira],
            **overrides,
        }
        return self.client.post(self.lore_url, json=data)

    def presence(self, *characters, story=None):
        url = f"/api/v1/stories/{story or self.story}/world-state"
        existing = self.client.get(url)
        self.assertEqual(existing.status_code, 200, existing.text)
        document = existing.json()
        state = document["state"]
        state["present_character_ids"] = list(characters)
        response = self.client.put(url, json={
            "expected_revision": document["revision"], "state": state,
        })
        self.assertEqual(response.status_code, 200, response.text)

    def preview(self, query="sello", story=None):
        url = f"/api/v1/stories/{story or self.story}/lorebook/preview"
        response = self.client.post(url, json={"query": query})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def turn(self):
        return self.app.state.narrative.append(
            self.story, str(uuid.uuid4()), "do", "La historia continúa.",
            "Luna contempla la muralla.", "fixture",
        )

    def fork(self, until=None):
        result = self.client.post(
            f"/api/v1/stories/{self.story}/fork", json={"until_turn_id": until},
        )
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()["id"]

    def test_keywords_and_always_active_cannot_bypass_witness_absence(self):
        secret = self.add()
        self.assertEqual(secret.status_code, 201, secret.text)
        never_present = self.preview("Aira menciona el sello antiguo.")
        self.assertEqual(never_present["entries"], [])
        self.assertEqual(never_present["skipped_visibility"], 1)
        story = self.app.state.narrative.get_story(self.story)
        prompt = self.app.state.narrative.messages(
            story, "Aira menciona el sello antiguo.", "do")
        self.assertNotIn("llave del sello", prompt[0]["content"])

        self.presence(self.beto)
        self.assertEqual(self.preview()["entries"], [])
        self.presence(self.aira)
        activated = self.preview()
        self.assertEqual(len(activated["entries"]), 1)
        self.assertEqual(activated["entries"][0]["visibility"], "witnesses")
        self.assertIn("Private knowledge of present characters: Aira",
                      activated["context"])
        self.assertIn("llave del sello", activated["context"])
        prompt = self.app.state.narrative.messages(story, "Toco el sello.", "do")
        self.assertIn("llave del sello", prompt[0]["content"])
        self.assertNotIn("llave del sello", prompt[-1]["content"])

        self.presence(self.beto)
        self.assertEqual(self.preview()["entries"], [])
        always = self.add(title="Otra pista",
                          content="Esta segunda pista nunca debe filtrarse sin testigo.",
                          keys=[], always_active=True)
        self.assertEqual(always.status_code, 201, always.text)
        self.assertNotIn("segunda pista", self.preview("cualquier cosa")["context"])

    def test_general_lore_unchanged_and_invalid_witnesses_rejected(self):
        general = self.add(title="Norma pública",
                           content="Todo viajero debe pagar peaje al cruzar la muralla.",
                           visibility="world", witness_character_ids=[])
        self.assertEqual(general.status_code, 201, general.text)
        self.assertIn("pagar peaje", self.preview()["context"])

        self.assertEqual(self.add(witness_character_ids=[]).status_code, 422)
        self.assertEqual(self.add(witness_character_ids=[self.aira, self.aira]).status_code, 422)
        self.assertEqual(self.add(visibility="world", witness_character_ids=[self.aira]).status_code, 422)
        self.assertEqual(self.add(visibility="unknown").status_code, 422)
        foreign = self.client.post("/api/v1/stories", json={
            "title": "Otro reino", "premise": "El reino es diferente.",
        }).json()["id"]
        outsider = self.npc(foreign, "Intrusa")
        self.assertEqual(self.add(witness_character_ids=[outsider]).status_code, 422)
        self.assertEqual(self.add(witness_character_ids=[str(uuid.uuid4())]).status_code, 422)
        entries = self.client.get(self.lore_url).json()["entries"]
        self.assertEqual(len(entries), 1)

    def test_cutoff_and_full_branch_remap_private_witnesses(self):
        self.presence(self.aira)
        early = self.add()
        self.assertEqual(early.status_code, 201, early.text)
        first = self.turn()
        original_entry = early.json()["id"]
        changed = self.client.put(self.lore_url + "/" + original_entry, json={
            "title": "Sello antiguo", "keys": ["sello"],
            "content": "La llave del sello fue robada por la hechicera.",
            "visibility": "witnesses",
            "witness_character_ids": [self.aira],
        })
        self.assertEqual(changed.status_code, 200, changed.text)
        second = self.add(title="Secreto de Beto",
                          content="Beto escondió una segunda llave en la fortaleza.",
                          witness_character_ids=[self.beto])
        self.assertEqual(second.status_code, 201, second.text)
        self.presence(self.beto)
        self.turn()

        early_branch = self.fork(first["id"])
        early_lore = self.client.get(
            f"/api/v1/stories/{early_branch}/lorebook").json()["entries"]
        early_cast = self.client.get(
            f"/api/v1/stories/{early_branch}/creator/characters").json()["characters"]
        self.assertEqual(len(early_lore), 1)
        self.assertEqual(len(early_cast), 2)
        branch_aira = next(npc["id"] for npc in early_cast if npc["name"] == "Aira")
        self.assertEqual(early_lore[0]["witness_character_ids"], [branch_aira])
        self.assertNotEqual(branch_aira, self.aira)
        self.assertIn("bajo la torre", early_lore[0]["content"])
        self.assertNotIn("hechicera", early_lore[0]["content"])
        self.assertIn("bajo la torre",
                      self.preview(story=early_branch)["context"])
        current = self.preview(story=self.story)
        self.assertNotIn("bajo la torre", current["context"])
        full = self.fork()
        full_lore = self.client.get(
            f"/api/v1/stories/{full}/lorebook").json()["entries"]
        full_cast = self.client.get(
            f"/api/v1/stories/{full}/creator/characters").json()["characters"]
        self.assertEqual(len(full_lore), 2)
        self.assertEqual(len(full_cast), 2)
        mapped_ids = {npc["id"] for npc in full_cast}
        self.assertTrue(all(set(lore["witness_character_ids"]).issubset(mapped_ids)
                            for lore in full_lore))
        self.assertIn("segunda llave", self.preview(story=full)["context"])

        # The first checkpoint's witness ID remains remapped in the copied history.
        turns = self.client.get(
            f"/api/v1/stories/{full}/turns").json()["turns"]
        old = self.client.get(
            f"/api/v1/stories/{full}/lorebook/turns/{turns[0]['id']}")
        self.assertEqual(old.status_code, 200, old.text)
        historic = old.json()["entries"]
        self.assertEqual(len(historic), 1)
        self.assertIn(historic[0]["witness_character_ids"][0], mapped_ids)
        self.assertNotEqual(historic[0]["witness_character_ids"][0], self.aira)

    def test_restart_preserves_private_scope(self):
        self.add()
        self.presence(self.beto)
        rebooted = create_app(Path(self.temp.name))
        with TestClient(rebooted) as other:
            response = other.post(self.lore_url + "/preview", json={"query": "sello"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["entries"], [])


if __name__ == "__main__":
    unittest.main()
