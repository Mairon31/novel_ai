"""Branching tests: create independent alternatives without mutating the original."""
import io
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app  # noqa: E402


class BranchTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.app=create_app(self.root)
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        self.parent=self.client.post("/api/v1/stories",json={
            "title":"Bosque lunar",
            "premise":"Una exploradora descubre las ruinas de un antiguo imperio.",
            "protagonist_name":"Aya"}).json()
        self.client.patch(f"/api/v1/stories/{self.parent['id']}/canon",json={
            "canon":"Aya todavía no conoce la identidad del guardián."})
        self.turns=[]
        for n in range(3):
            turn=self.app.state.narrative.append(
                self.parent["id"],str(uuid.uuid4()),"do",f"Aya actúa {n}",
                f"La historia avanza {n}.","fixture-llm")
            self.turns.append(turn)
        image=Image.new("RGB",(25,25),(15,45,120))
        content=io.BytesIO()
        image.save(content,format="PNG")
        uploaded=self.client.post(
            f"/api/v1/stories/{self.parent['id']}/scene-image",
            files={"file":("test.png",content.getvalue(),"image/png")})
        self.assertEqual(uploaded.status_code,200,uploaded.text)

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.tmp.cleanup()

    def test_fork_from_first_turn_copies_only_history_until_selection(self):
        result=self.client.post(f"/api/v1/stories/{self.parent['id']}/fork",
                                 json={"until_turn_id":self.turns[0]["id"]})
        self.assertEqual(result.status_code,201,result.text)
        fork=result.json()
        self.assertNotEqual(fork["id"],self.parent["id"])
        self.assertEqual(fork["origin_story_id"],self.parent["id"])
        self.assertEqual(fork["origin_turn_id"],self.turns[0]["id"])
        self.assertEqual(fork["canon"],"Aya todavía no conoce la identidad del guardián.")
        self.assertEqual(fork["protagonist_name"],"Aya")
        self.assertTrue(fork["scene_image_url"])
        branch_turns=self.client.get(f"/api/v1/stories/{fork['id']}/turns").json()["turns"]
        self.assertEqual(len(branch_turns),1)
        self.assertEqual(branch_turns[0]["assistant_text"],self.turns[0]["assistant_text"])
        self.assertNotEqual(branch_turns[0]["id"],self.turns[0]["id"])
        self.assertEqual(
            self.client.get(f"/api/v1/stories/{fork['id']}/scene-image").content,
            self.client.get(f"/api/v1/stories/{self.parent['id']}/scene-image").content)

        self.app.state.narrative.append(fork["id"],str(uuid.uuid4()),"say",
                                         "Me voy","El camino cambia.","fixture-llm")
        self.client.patch(f"/api/v1/stories/{fork['id']}/canon",
                          json={"canon":"Aya descubrió otra salida."})
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.parent['id']}/turns").json()["turns"]),3)
        original=self.client.get(f"/api/v1/stories/{self.parent['id']}").json()
        self.assertEqual(original["canon"],
                         "Aya todavía no conoce la identidad del guardián.")
        self.assertIsNone(original["origin_story_id"])

    def test_branch_clones_gallery_visual_identity_and_no_future_scene_leak(self):
        # Original scene and its art exist before the later forest chapter.
        first=self.app.state.visual.all(self.parent["id"])
        self.assertEqual(len(first["assets"]),1)
        char={
            "name":"Aira", "appearance":"Cabello rojo rizado y ojos verde esmeralda.",
            "outfit":"Armadura de cuero", "distinguishing_features":"Pulsera azul",
        }
        added=self.client.post(
            f"/api/v1/stories/{self.parent['id']}/visual-characters",json=char)
        self.assertEqual(added.status_code,201,added.text)
        prior_turn=self.turns[0]["id"]
        next_turn=self.app.state.narrative.append(
            self.parent["id"],str(uuid.uuid4()),"continue","",
            "Llegaron al bosque oscuro. Aira observó las estrellas.","fixture")
        self.assertIsNotNone(next_turn.get("scene_transition"))
        data=io.BytesIO()
        Image.new("RGB",(25,25),(210,40,10)).save(data,format="PNG")
        late=self.client.post(
            f"/api/v1/stories/{self.parent['id']}/scene-image",
            files={"file":("new.png",data.getvalue(),"image/png")})
        self.assertEqual(late.status_code,200,late.text)
        source_gallery=self.app.state.visual.all(self.parent["id"])
        self.assertEqual(len(source_gallery["scenes"]),2)
        self.assertEqual(len(source_gallery["assets"]),2)

        early=self.client.post(f"/api/v1/stories/{self.parent['id']}/fork",
            json={"until_turn_id":prior_turn})
        self.assertEqual(early.status_code,201,early.text)
        branch=early.json()["id"]
        fork_gallery=self.client.get(
            f"/api/v1/stories/{branch}/visual-state").json()
        self.assertEqual(len(fork_gallery["scenes"]),1)
        self.assertEqual(len(fork_gallery["assets"]),1)
        self.assertEqual(len(fork_gallery["characters"]),1)
        self.assertEqual(fork_gallery["characters"][0]["name"],"Aira")
        self.assertNotEqual(fork_gallery["assets"][0]["id"],
                            source_gallery["assets"][1]["id"])
        self.assertNotEqual(
            self.client.get(f"/api/v1/stories/{branch}/scene-image").content,
            self.client.get(f"/api/v1/stories/{self.parent['id']}/scene-image").content)
        fork_person=fork_gallery["characters"][0]
        edit=self.client.put(
            f"/api/v1/stories/{branch}/visual-characters/{fork_person['id']}",
            json={**char,"outfit":"Capa amarilla"})
        self.assertEqual(edit.status_code,200,edit.text)
        unchanged=self.app.state.visual.all(self.parent["id"])
        self.assertEqual(unchanged["characters"][0]["outfit"],"Armadura de cuero")

        full=self.client.post(f"/api/v1/stories/{self.parent['id']}/fork",json={})
        self.assertEqual(full.status_code,201,full.text)
        copied=self.client.get(
            f"/api/v1/stories/{full.json()['id']}/visual-state").json()
        self.assertEqual(len(copied["scenes"]),2)
        self.assertEqual(len(copied["assets"]),2)
        self.assertEqual(len(copied["characters"]),1)
        self.assertEqual(copied["selected_asset_id"],copied["assets"][0]["id"])

    def test_full_fork_and_foreign_turn_validation(self):
        full=self.client.post(f"/api/v1/stories/{self.parent['id']}/fork",json={})
        self.assertEqual(full.status_code,201,full.text)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{full.json()['id']}/turns").json()["turns"]),3)
        wrong=self.client.post(f"/api/v1/stories/{self.parent['id']}/fork",
                               json={"until_turn_id":str(uuid.uuid4())})
        self.assertEqual(wrong.status_code,422)
        self.assertEqual(len(self.client.get("/api/v1/stories").json()["stories"]),2)
        missing=self.client.post(f"/api/v1/stories/{uuid.uuid4()}/fork",json={})
        self.assertEqual(missing.status_code,422)


if __name__=="__main__":
    unittest.main()
