"""Tests for real ComfyUI HTTP contract and Pillow output validation, using mocks."""
import io
import sys
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class ComfyFixture:
    def __init__(self):
        self.requests = []
        self.offline = False
        self.invalid_image = False
        self.bad_model = False
        self.bad_upload = False
        self.missing_lora = False
        self.lora_nodes_available = True
        self.lora_inventory_invalid = False
        self.lora_offline = False
        self.last_workflow = None

    def __call__(self, request: httpx.Request):
        self.requests.append(request)
        path = request.url.path
        if self.offline:
            return httpx.Response(503)
        if path == "/models/checkpoints":
            return httpx.Response(200, json=[
                "my-story-checkpoint.safetensors" if not self.bad_model else "different.safetensors"])
        if path == "/models/loras":
            if self.lora_offline:
                return httpx.Response(503)
            return httpx.Response(200, json=(
                {"incorrect": "format"} if self.lora_inventory_invalid else
                ["other.safetensors"] if self.missing_lora else
                ["aira.safetensors", "bel.safetensors", "cora.safetensors"]))
        if path == "/object_info/LoraLoader":
            if not self.lora_nodes_available:
                return httpx.Response(200, json={})
            required = {key: [] for key in
                        ("model", "clip", "lora_name", "strength_model", "strength_clip")}
            return httpx.Response(200, json={
                "LoraLoader": {"input": {"required": required}}})
        if path == "/upload/image":
            self.uploaded_bytes = request.content
            return httpx.Response(200, json={"name": "../escape.png" if self.bad_upload else "reference.png", "type": "input"})
        if path == "/prompt":
            data = __import__("json").loads(request.content)
            nodes = data["prompt"]
            assert nodes["1"]["class_type"] == "CheckpointLoaderSimple"
            assert nodes["1"]["inputs"]["ckpt_name"] == "my-story-checkpoint.safetensors"
            assert "Un castillo al anochecer" in nodes["2"]["inputs"]["text"]
            assert nodes["7"]["class_type"] == "SaveImage"
            self.last_workflow = nodes
            return httpx.Response(200, json={"prompt_id": "123e4567"})
        if path == "/history/123e4567":
            return httpx.Response(200, json={"123e4567": {
                "outputs": {"7": {"images": [{
                    "filename": "rendered.png", "subfolder": "", "type": "output"}]}}}})
        if path == "/view":
            if self.invalid_image:
                return httpx.Response(200, content=b"not a valid image")
            img = Image.new("RGB", (128, 96), (60, 80, 130))
            output = io.BytesIO()
            img.save(output, format="PNG")
            return httpx.Response(200, content=output.getvalue())
        return httpx.Response(404)


class ComfySceneTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.fixture = ComfyFixture()
        self.app = create_app(Path(self.temp.name),
                              image_transport=httpx.MockTransport(self.fixture))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        self.story = self.client.post("/api/v1/stories", json={
            "title": "La torre",
            "premise": "Una princesa visita una torre mágica bajo la lluvia."}).json()["id"]

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.temp.cleanup()

    def setup_comfy(self):
        response = self.client.put("/api/v1/images/config", json={
            "provider": "comfyui", "base_url": "http://127.0.0.1:8188",
            "checkpoint": "my-story-checkpoint.safetensors",
            "width": 512, "height": 512, "steps": 12, "cfg": 6.5,
            "negative_prompt": "bad quality"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_no_generation_ever_without_user_request(self):
        self.client.get("/api/v1/images/config")
        self.client.get("/api/v1/stories")
        self.client.get("/api/v1/stories/" + self.story + "/turns")
        self.assertEqual(self.fixture.requests, [])
        self.assertIsNone(self.client.get("/api/v1/stories/" + self.story).json()["scene_image_url"])

    def test_manual_comfy_generation_persists_valid_webp(self):
        self.setup_comfy()
        detected = self.client.get("/api/v1/images/status")
        self.assertEqual(detected.status_code, 200)
        self.assertEqual(detected.json()["checkpoints"], ["my-story-checkpoint.safetensors"])
        response = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                    json={"prompt": "Un castillo al anochecer", "seed": 12345})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["seed"], 12345)
        self.assertTrue(response.json()["story"]["scene_image_url"])
        result = self.client.get(f"/api/v1/stories/{self.story}/scene-image")
        self.assertEqual(result.status_code, 200)
        with Image.open(io.BytesIO(result.content)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (128, 96))
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path == "/prompt"]), 1)
        # No extra generation on ordinary reading.
        self.client.get(f"/api/v1/stories/{self.story}")
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path == "/prompt"]), 1)

    def test_creator_visual_tags_reach_explicit_comfy_prompt_and_invalidate_cache(self):
        self.setup_comfy()
        uri = f"/api/v1/stories/{self.story}"
        body = {"prompt": "Un castillo al anochecer con Aira", "seed": 9876}
        first = self.client.post(uri + "/illustrate", json=body)
        self.assertEqual(first.status_code, 200, first.text)
        previous = first.json()["asset_id"]
        self.assertNotIn("cabello plateado", self.fixture.last_workflow["2"]["inputs"]["text"])
        creator = self.client.post(uri + "/creator/characters", json={
            "name": "Aira",
            "description": "Guardiana de las puertas de cristal del castillo.",
            "visual_dna": {"tags": ["cabello plateado", "ojos ámbar"],
                           "seed": 345, "lora_name": "aira.safetensors"},
        })
        self.assertEqual(creator.status_code, 201, creator.text)
        # Preview and rendering use the same canonical prompt enrichment.
        preview = self.client.post(uri + "/illustration-prompt",
                                   json={"prompt": body["prompt"]})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertIn("cabello plateado", preview.json()["prompt"])
        self.assertNotIn("aira.safetensors", preview.json()["prompt"])
        second = self.client.post(uri + "/illustrate", json=body)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(previous, second.json()["asset_id"])
        self.assertFalse(second.json()["cached"])
        prompt = self.fixture.last_workflow["2"]["inputs"]["text"]
        self.assertIn("cabello plateado", prompt)
        self.assertIn("ojos ámbar", prompt)
        self.assertNotIn("aira.safetensors", prompt)
        self.assertEqual(self.fixture.last_workflow["5"]["inputs"]["seed"], 9876)
        replay = self.client.post(uri + "/illustrate", json=body)
        self.assertTrue(replay.json()["cached"])
        self.assertEqual(replay.json()["asset_id"], second.json()["asset_id"])
        self.assertEqual(len([request for request in self.fixture.requests
                              if request.url.path == "/prompt"]), 2)

    def add_lora_character(self, name="Aira", filename="aira.safetensors",
                           visual_id=None, weight=0.7):
        body = {"name": name,
                "description": f"{name} protege la entrada al antiguo castillo.",
                "visual_dna": {"tags": ["ojos verdes"], "lora_name": filename,
                               "lora_strength": weight}}
        if visual_id is not None:
            body["visual_character_id"] = visual_id
        response = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_explicit_opt_in_required_for_lora_and_inventory_available(self):
        self.setup_comfy()
        self.add_lora_character()
        result = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
            json={"prompt": "Aira observa Un castillo al anochecer", "seed": 4001})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["applied_loras"], [])
        self.assertNotIn("10", self.fixture.last_workflow)
        self.assertFalse(any(r.url.path == "/models/loras"
                             for r in self.fixture.requests))
        checked = self.client.get("/api/v1/images/loras")
        self.assertEqual(checked.status_code, 200)
        self.assertEqual(checked.json()["loras"][0], "aira.safetensors")
        self.assertTrue(checked.json()["online"])

    def test_active_lora_is_in_comfy_graph_and_signature_separates_modes(self):
        self.setup_comfy()
        self.add_lora_character()
        endpoint = f"/api/v1/stories/{self.story}/illustrate"
        body = {"prompt": "Aira camina por Un castillo al anochecer",
                "seed": 4002}
        plain = self.client.post(endpoint, json=body)
        self.assertEqual(plain.status_code, 200, plain.text)
        first = self.client.post(endpoint, json={
            **body, "apply_character_loras": True})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertFalse(first.json()["cached"])
        self.assertNotEqual(first.json()["asset_id"], plain.json()["asset_id"])
        self.assertEqual(first.json()["applied_loras"][0]["lora_name"], "aira.safetensors")
        archive = self.client.get(f"/api/v1/stories/{self.story}/visual-state")
        self.assertEqual(archive.status_code, 200, archive.text)
        rendered = next(item for item in archive.json()["assets"]
                        if item["id"] == first.json()["asset_id"])
        self.assertEqual(rendered["render_details"]["workflow_version"],
                         "comfy-native-v3-lora")
        self.assertEqual(rendered["render_details"]["loras"],
                         first.json()["applied_loras"])
        self.assertEqual(self.fixture.last_workflow["10"]["class_type"], "LoraLoader")
        self.assertEqual(self.fixture.last_workflow["10"]["inputs"], {
            "model": ["1", 0], "clip": ["1", 1],
            "lora_name": "aira.safetensors", "strength_model": 0.7,
            "strength_clip": 0.7})
        self.assertEqual(self.fixture.last_workflow["2"]["inputs"]["clip"], ["10", 1])
        self.assertEqual(self.fixture.last_workflow["3"]["inputs"]["clip"], ["10", 1])
        self.assertEqual(self.fixture.last_workflow["5"]["inputs"]["model"], ["10", 0])
        again = self.client.post(endpoint, json={
            **body, "apply_character_loras": True})
        self.assertEqual(again.status_code, 200, again.text)
        self.assertTrue(again.json()["cached"])
        self.assertEqual(again.json()["asset_id"], first.json()["asset_id"])
        self.assertEqual(len([r for r in self.fixture.requests
                              if r.url.path == "/prompt"]), 2)
        self.fixture.offline = True
        offline = self.client.post(endpoint, json={
            **body, "apply_character_loras": True})
        self.assertEqual(offline.status_code, 200, offline.text)
        self.assertTrue(offline.json()["cached"])

    def test_lora_multi_character_planned_chain_and_img2img_reference(self):
        self.setup_comfy()
        ref = io.BytesIO()
        Image.new("RGB", (64, 64), (20, 130, 170)).save(ref, "PNG")
        imported = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("reference.png", ref.getvalue(), "image/png")})
        self.assertEqual(imported.status_code, 200, imported.text)
        asset = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        ids = []
        for name, filename in [("Aira", "aira.safetensors"),
                               ("Bel", "bel.safetensors"),
                               ("Cora", "cora.safetensors")]:
            visual = self.client.post(
                f"/api/v1/stories/{self.story}/visual-characters",
                json={"name": name, "appearance":
                      f"{name} lleva un elegante manto de aventurero."})
            self.assertEqual(visual.status_code, 201, visual.text)
            ident = visual.json()["id"]
            ids.append(ident)
            self.add_lora_character(name, filename, ident)
        plan = self.client.put(f"/api/v1/stories/{self.story}/scene-plan",
            json={"visible_character_ids": ids[:2],
                  "shot": "medium", "lighting": "natural"})
        self.assertEqual(plan.status_code, 200, plan.text)
        result = self.client.post(f"/api/v1/stories/{self.story}/illustrate", json={
            "prompt": "Una visita a Un castillo al anochecer",
            "seed": 4003, "reference_asset_id": asset,
            "apply_character_loras": True})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual([x["lora_name"] for x in result.json()["applied_loras"]],
                         ["aira.safetensors", "bel.safetensors"])
        graph = self.fixture.last_workflow
        self.assertEqual(graph["10"]["inputs"]["model"], ["1", 0])
        self.assertEqual(graph["11"]["inputs"]["model"], ["10", 0])
        self.assertEqual(graph["11"]["inputs"]["clip"], ["10", 1])
        self.assertEqual(graph["2"]["inputs"]["clip"], ["11", 1])
        self.assertEqual(graph["5"]["inputs"]["model"], ["11", 0])
        self.assertEqual(graph["5"]["inputs"]["latent_image"], ["9", 0])
        self.assertNotIn("12", graph)
        self.assertNotIn("4", graph)
        self.assertEqual(graph["8"]["class_type"], "LoadImage")

    def test_lora_missing_node_or_inventory_fails_before_submission(self):
        self.setup_comfy()
        self.add_lora_character()
        endpoint = f"/api/v1/stories/{self.story}/illustrate"
        payload = {"prompt": "Aira visita Un castillo al anochecer",
                   "seed": 9109, "apply_character_loras": True}
        self.fixture.missing_lora = True
        missing = self.client.post(endpoint, json=payload)
        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertIn("LoRA no instalado", missing.text)
        self.fixture.missing_lora = False
        self.fixture.lora_nodes_available = False
        absent = self.client.post(endpoint, json=payload)
        self.assertEqual(absent.status_code, 422, absent.text)
        self.assertIn("LoraLoader", absent.text)
        self.fixture.lora_nodes_available = True
        self.fixture.lora_offline = True
        offline = self.client.post(endpoint, json=payload)
        self.assertEqual(offline.status_code, 503, offline.text)
        self.fixture.lora_offline = False
        self.fixture.lora_inventory_invalid = True
        malformed = self.client.post(endpoint, json=payload)
        self.assertEqual(malformed.status_code, 503, malformed.text)
        self.assertEqual(len([r for r in self.fixture.requests
                              if r.url.path == "/prompt"]), 0)
        self.assertIsNone(self.client.get(
            f"/api/v1/stories/{self.story}").json()["scene_image_url"])

    def test_lora_without_active_character_or_duplicate_fails_closed(self):
        self.setup_comfy()
        self.add_lora_character()
        endpoint = f"/api/v1/stories/{self.story}/illustrate"
        absent = self.client.post(endpoint, json={
            "prompt": "Un castillo al anochecer, nadie en el salón",
            "apply_character_loras": True})
        self.assertEqual(absent.status_code, 422, absent.text)
        self.assertFalse(any(r.url.path == "/models/loras"
                             for r in self.fixture.requests))
        self.add_lora_character("Bel", "aira.safetensors")
        repeated = self.client.post(endpoint, json={
            "prompt": "Aira y Bel recorren Un castillo al anochecer",
            "apply_character_loras": True})
        self.assertEqual(repeated.status_code, 422, repeated.text)
        self.assertIn("misma LoRA", repeated.text)

    def test_invalid_or_offline_provider_does_not_replace_previous_art(self):
        self.setup_comfy()
        good = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(good.status_code, 200, good.text)
        before = self.client.get(f"/api/v1/stories/{self.story}/scene-image").content
        self.fixture.invalid_image = True
        failed = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                  json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(failed.status_code, 502, failed.text)
        self.assertEqual(before, self.client.get(f"/api/v1/stories/{self.story}/scene-image").content)
        self.fixture.offline = True
        down = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(down.status_code, 503, down.text)

    def test_exact_seed_config_and_character_reuse_without_second_diffusion(self):
        self.setup_comfy()
        endpoint=f"/api/v1/stories/{self.story}/illustrate"
        body={"prompt":"Luna en Un castillo al anochecer", "seed":101010}
        first=self.client.post(endpoint,json=body)
        self.assertEqual(first.status_code,200,first.text)
        self.assertFalse(first.json()["cached"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/prompt"]),1)
        gallery=self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()
        self.assertEqual(len(gallery["assets"]),1)
        self.fixture.offline=True
        cached=self.client.post(endpoint,json=body)
        self.assertEqual(cached.status_code,200,cached.text)
        self.assertTrue(cached.json()["cached"])
        self.assertEqual(cached.json()["asset_id"],first.json()["asset_id"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/prompt"]),1)
        self.fixture.offline=False
        changed=self.client.post(endpoint,json={**body,"seed":101011})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertFalse(changed.json()["cached"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/prompt"]),2)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"]),2)

        # A changed character bible produces a new signature even for same seed.
        profile={"name":"Luna","appearance":"Cabello violeta, ojos turquesa y orejas puntiagudas.",
                 "outfit":"Capa negra", "distinguishing_features":"Un aro plateado"}
        added=self.client.post(
            f"/api/v1/stories/{self.story}/visual-characters",json=profile)
        self.assertEqual(added.status_code,201,added.text)
        generated=self.client.post(endpoint,json=body)
        self.assertEqual(generated.status_code,200,generated.text)
        self.assertFalse(generated.json()["cached"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/prompt"]),3)

    def test_img2img_uses_owned_reference_and_vae_encode_nodes(self):
        self.setup_comfy()
        from PIL import Image
        sample=io.BytesIO()
        Image.new("RGB",(280,200),(37,115,177)).save(sample,format="PNG")
        image=self.client.post(f"/api/v1/stories/{self.story}/scene-image",
            files={"file":("reference.png",sample.getvalue(),"image/png")})
        self.assertEqual(image.status_code,200,image.text)
        state=self.client.get(f"/api/v1/stories/{self.story}/visual-state").json()
        ref=state["assets"][0]["id"]
        args={"prompt":"Una nueva escena dentro de Un castillo al anochecer",
              "reference_asset_id":ref,"denoise":0.48,"seed":777}
        first=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json=args)
        self.assertEqual(first.status_code,200,first.text)
        self.assertFalse(first.json()["cached"])
        self.assertEqual(self.fixture.last_workflow["8"]["class_type"],"LoadImage")
        self.assertEqual(self.fixture.last_workflow["9"]["class_type"],"VAEEncode")
        self.assertEqual(self.fixture.last_workflow["9"]["inputs"]["vae"],["1",2])
        self.assertEqual(self.fixture.last_workflow["5"]["inputs"]["latent_image"],["9",0])
        self.assertAlmostEqual(self.fixture.last_workflow["5"]["inputs"]["denoise"],0.48)
        self.assertNotIn("4",self.fixture.last_workflow)
        self.assertIn(b"NobleAI-Reference.png",self.fixture.uploaded_bytes)
        upload_count=len([r for r in self.fixture.requests if r.url.path=="/upload/image"])
        self.assertEqual(upload_count,1)

        self.fixture.offline=True
        reused=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json=args)
        self.assertEqual(reused.status_code,200,reused.text)
        self.assertTrue(reused.json()["cached"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/upload/image"]),
                         upload_count)
        self.fixture.offline=False
        changed=self.client.post(f"/api/v1/stories/{self.story}/illustrate",
            json={**args,"denoise":0.69})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertFalse(changed.json()["cached"])
        self.assertEqual(len([r for r in self.fixture.requests if r.url.path=="/upload/image"]),2)

    def test_img2img_blocks_other_story_and_invalid_upload_name(self):
        self.setup_comfy()
        image=io.BytesIO()
        Image.new("RGB",(30,30),(9,40,50)).save(image,format="PNG")
        self.client.post(f"/api/v1/stories/{self.story}/scene-image",
            files={"file":("reference.png",image.getvalue(),"image/png")})
        asset=self.client.get(f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        other=self.client.post("/api/v1/stories",json={
            "title":"Otro mundo","premise":"Una exploradora se dirige a una ciudad lejana."}).json()["id"]
        prompt="Un castillo al anochecer con otra iluminación"
        cross=self.client.post(f"/api/v1/stories/{other}/illustrate",json={
            "prompt":prompt,"reference_asset_id":asset})
        self.assertEqual(cross.status_code,422)
        self.assertNotIn("/upload/image",[r.url.path for r in self.fixture.requests])
        self.fixture.bad_upload=True
        failure=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
            "prompt":prompt,"reference_asset_id":asset})
        self.assertEqual(failure.status_code,502)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"]),1)

    def test_saved_scene_plan_uses_named_character_reference_without_manual_asset_id(self):
        self.setup_comfy()
        sample=io.BytesIO()
        Image.new("RGB",(64,64),(180,110,30)).save(sample,"PNG")
        imported=self.client.post(f"/api/v1/stories/{self.story}/scene-image",
            files={"file":("portrait.png",sample.getvalue(),"image/png")})
        self.assertEqual(imported.status_code,200,imported.text)
        asset=self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        character=self.client.post(
            f"/api/v1/stories/{self.story}/visual-characters",
            json={"name":"Luna","appearance":"Cabello azul oscuro y ojos ámbar, cabello trenzado.",
                  "outfit":"Uniforme verde", "distinguishing_features":"Medallón blanco"})
        self.assertEqual(character.status_code,201,character.text)
        character_id=character.json()["id"]
        linked=self.client.put(
            f"/api/v1/stories/{self.story}/visual-characters/{character_id}/reference",
            json={"asset_id":asset})
        self.assertEqual(linked.status_code,200,linked.text)
        saved=self.client.put(f"/api/v1/stories/{self.story}/scene-plan",json={
            "shot":"medium","lighting":"sunset",
            "direction":"Luna contempla las luces del castillo.",
            "visible_character_ids":[character_id],
            "reference_character_id":character_id})
        self.assertEqual(saved.status_code,200,saved.text)

        generated=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
            "prompt":"Luna frente a Un castillo al anochecer", "seed":1234})
        self.assertEqual(generated.status_code,200,generated.text)
        self.assertEqual(generated.json()["reference_asset_id"],asset)
        self.assertEqual(self.fixture.last_workflow["8"]["class_type"],"LoadImage")
        self.assertEqual(self.fixture.last_workflow["9"]["class_type"],"VAEEncode")
        self.assertIn("Luna",self.fixture.last_workflow["2"]["inputs"]["text"])
        self.assertIn("atardecer",self.fixture.last_workflow["2"]["inputs"]["text"])
        self.assertEqual(len([request for request in self.fixture.requests
                              if request.url.path=="/upload/image"]),1)

        repeated=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
            "prompt":"Luna frente a Un castillo al anochecer","seed":1234})
        self.assertEqual(repeated.status_code,200,repeated.text)
        self.assertTrue(repeated.json()["cached"])
        self.assertEqual(len([request for request in self.fixture.requests
                              if request.url.path=="/upload/image"]),1)

    def test_security_and_model_validation(self):
        invalid = self.client.put("/api/v1/images/config", json={
            "base_url": "http://evil.example:8188"})
        self.assertEqual(invalid.status_code, 422)
        oversize = self.client.put("/api/v1/images/config", json={
            "width": 1536, "height": 1536})
        self.assertEqual(oversize.status_code, 422)
        no_model = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                    json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(no_model.status_code, 422)
        self.setup_comfy()
        self.fixture.bad_model = True
        gone = self.client.post(f"/api/v1/stories/{self.story}/illustrate",
                                json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(gone.status_code, 422)
        wrong_story = self.client.post(f"/api/v1/stories/{__import__('uuid').uuid4()}/illustrate",
                                      json={"prompt": "Un castillo al anochecer"})
        self.assertEqual(wrong_story.status_code, 404)


if __name__ == "__main__":
    unittest.main()
