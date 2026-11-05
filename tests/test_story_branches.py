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
