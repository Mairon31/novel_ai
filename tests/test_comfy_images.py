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

    def __call__(self, request: httpx.Request):
        self.requests.append(request)
        path = request.url.path
        if self.offline:
            return httpx.Response(503)
        if path == "/models/checkpoints":
            return httpx.Response(200, json=[
                "my-story-checkpoint.safetensors" if not self.bad_model else "different.safetensors"])
        if path == "/prompt":
            data = __import__("json").loads(request.content)
            nodes = data["prompt"]
            assert nodes["1"]["class_type"] == "CheckpointLoaderSimple"
            assert nodes["1"]["inputs"]["ckpt_name"] == "my-story-checkpoint.safetensors"
            assert "Un castillo al anochecer" in nodes["2"]["inputs"]["text"]
            assert nodes["7"]["class_type"] == "SaveImage"
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
        body={"prompt":"Un castillo al anochecer", "seed":101010}
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
