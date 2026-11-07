"""Scene plans, canonical character references, and branch isolation.

Uses the production API + SQLite + Pillow; never invokes a real GPU.
"""
import io
from concurrent.futures import ThreadPoolExecutor
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from PIL import Image
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app


def png(color=(150,90,40)):
    image=Image.new("RGB",(128,96),color)
    output=io.BytesIO()
    image.save(output,"PNG")
    return output.getvalue()


class ScenePlanningTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.app=create_app(self.root)
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        self.story=self.client.post("/api/v1/stories",json={
            "title":"Lago de los reflejos",
            "premise":"La exploradora llega a un palacio sobre un lago.",
            "protagonist_name":"Luna"}).json()["id"]
        self.char=self.client.post(f"/api/v1/stories/{self.story}/visual-characters",json={
            "name":"Luna",
            "appearance":"Cabello violeta y ojos verde agua, peinado corto.",
            "outfit":"Vestido azul profundo",
            "distinguishing_features":"Medallón circular plateado",
        }).json()["id"]
        uploaded=self.client.post(f"/api/v1/stories/{self.story}/scene-image",files={
            "file":("portrait.png",png(),"image/png")})
        self.assertEqual(uploaded.status_code,200,uploaded.text)
        self.asset=self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.temp.cleanup()

    def test_plan_only_updates_current_scene_and_prompt_is_explicit(self):
        read=self.client.get(f"/api/v1/stories/{self.story}/scene-plan")
        self.assertEqual(read.status_code,200)
        self.assertEqual(read.json()["revision"],0)
        plan={
            "shot":"closeup", "lighting":"sunset", "mood":"melancólico",
            "direction":"Luna sostiene el medallón frente al lago.",
            "visible_character_ids":[self.char], "reference_character_id":self.char,
        }
        saved=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json=plan)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(saved.json()["revision"],1)
        preview=self.client.post(f"/api/v1/stories/{self.story}/scene-plan/preview",json={
            "prompt":"Primer encuentro al borde de un lago mágico."})
        self.assertEqual(preview.status_code,200,preview.text)
        text=preview.json()["prompt"]
        for fragment in ("close-up", "sunset", "melancólico", "Luna",
                         "Cabello violeta", "Medallón circular", "Primer encuentro"):
            self.assertIn(fragment,text)
        self.assertEqual(preview.json()["revision"],1)
        self.assertIsNone(preview.json()["reference_asset_id"])
        self.assertEqual(len(self.client.get(f"/api/v1/stories/{self.story}/visual-state")
                             .json()["assets"]),1)

        second=self.client.put(f"/api/v1/stories/{self.story}/scene",json={
            "location":"Torre del norte"})
        self.assertEqual(second.status_code,200)
        new=self.client.get(f"/api/v1/stories/{self.story}/scene-plan").json()
        self.assertEqual(new["revision"],0)
        self.assertNotEqual(new["scene_id"],saved.json()["scene_id"])
        self.client.put(f"/api/v1/stories/{self.story}/scene",json={
            "location":"Lago de los reflejos"})
        self.assertEqual(self.client.get(f"/api/v1/stories/{self.story}/scene-plan")
                         .json()["revision"],0)

    def test_reference_integrity_story_ownership_and_fork_remap(self):
        attached=self.client.put(
            f"/api/v1/stories/{self.story}/visual-characters/{self.char}/reference",
            json={"asset_id":self.asset})
        self.assertEqual(attached.status_code,200,attached.text)
        self.assertEqual(attached.json()["reference_asset_id"],self.asset)
        self.assertEqual(attached.json()["revision"],2)
        prepared=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "shot":"wide", "lighting":"natural", "visible_character_ids":[self.char],
            "reference_character_id":self.char})
        self.assertEqual(prepared.status_code,200,prepared.text)
        plan=self.client.post(f"/api/v1/stories/{self.story}/scene-plan/preview",json={
            "prompt":"Una torre al fondo y Luna observando el horizonte."})
        self.assertEqual(plan.json()["reference_asset_id"],self.asset)

        fork=self.client.post(f"/api/v1/stories/{self.story}/fork",json={})
        self.assertEqual(fork.status_code,201,fork.text)
        branch=fork.json()["id"]
        state=self.client.get(f"/api/v1/stories/{branch}/visual-state").json()
        self.assertEqual(len(state["assets"]),1)
        self.assertEqual(len(state["characters"]),1)
        fork_asset=state["assets"][0]["id"]
        fork_character=state["characters"][0]
        self.assertNotEqual(fork_asset,self.asset)
        self.assertNotEqual(fork_character["id"],self.char)
        self.assertEqual(fork_character["reference_asset_id"],fork_asset)
        branch_plan=self.client.get(f"/api/v1/stories/{branch}/scene-plan").json()
        self.assertEqual(branch_plan["visible_character_ids"],[fork_character["id"]])
        self.assertEqual(branch_plan["reference_character_id"],fork_character["id"])
        preview=self.client.post(f"/api/v1/stories/{branch}/scene-plan/preview",json={
            "prompt":"Luna frente a las montañas en un atardecer rojo."})
        self.assertEqual(preview.json()["reference_asset_id"],fork_asset)
        wrong=self.client.put(
            f"/api/v1/stories/{branch}/visual-characters/{fork_character['id']}/reference",
            json={"asset_id":self.asset})
        self.assertEqual(wrong.status_code,422)
        still=self.client.get(f"/api/v1/stories/{self.story}/visual-state").json()
        self.assertEqual(still["characters"][0]["reference_asset_id"],self.asset)

    def test_plan_validation_and_corrupt_reference_rejected(self):
        other=self.client.post("/api/v1/stories",json={
            "title":"Segundo mundo","premise":"Existe otro reino."}).json()["id"]
        foreign=self.client.put(f"/api/v1/stories/{other}/scene-plan",json={
            "visible_character_ids":[self.char]})
        self.assertEqual(foreign.status_code,422)
        duplicate=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "visible_character_ids":[self.char,self.char]})
        self.assertEqual(duplicate.status_code,422)
        missing=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "reference_character_id":self.char})
        self.assertEqual(missing.status_code,422)
        invalid=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "shot":"fisheye"})
        self.assertEqual(invalid.status_code,422)
        asset_file=self.root/"story-assets"/self.story/"images"/(self.asset+".webp")
        asset_file.write_bytes(b"image-corrupted")
        protected=self.client.put(
            f"/api/v1/stories/{self.story}/visual-characters/{self.char}/reference",
            json={"asset_id":self.asset})
        self.assertEqual(protected.status_code,422)
        self.assertIsNone(self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["characters"][0]
            ["reference_asset_id"])

    def test_first_visual_scene_is_atomic_with_concurrent_readers(self):
        other=self.client.post("/api/v1/stories",json={
            "title":"Escena simultánea","premise":"Una joven despierta en un bosque."}).json()["id"]
        with ThreadPoolExecutor(max_workers=12) as pool:
            scenes=list(pool.map(lambda _: self.app.state.visual.scene(other),range(30)))
        self.assertEqual(len({scene["id"] for scene in scenes}),1)
        with self.app.state.store._conn() as conn:
            count=conn.execute(
                "SELECT COUNT(*) FROM visual_scenes WHERE story_id=?",(other,)).fetchone()[0]
        self.assertEqual(count,1)

    def test_plan_survives_api_restart(self):
        self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "shot":"medium","lighting":"interior","mood":"silencio inquietante",
            "visible_character_ids":[self.char]})
        restarted=create_app(self.root)
        with TestClient(restarted) as client:
            result=client.get(f"/api/v1/stories/{self.story}/scene-plan")
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json()["mood"],"silencio inquietante")
            self.assertEqual(result.json()["revision"],1)


if __name__=="__main__":
    unittest.main()
