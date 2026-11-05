"""Assert local GPU work coordination is explicit, nonblocking and isolated.

No actual GPU is required. The competing operation is represented by a live
in-memory lease while HTTP requests exercise the production application.
"""
import asyncio
import io
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from fastapi.testclient import TestClient
import httpx

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app


class FakeImages:
    def __init__(self):
        self.calls=0

    def __call__(self,request:httpx.Request):
        if request.url.path=="/models/checkpoints":
            return httpx.Response(200,json=["noble.safetensors"])
        if request.url.path=="/prompt":
            self.calls+=1
            return httpx.Response(200,json={"prompt_id":"noble01"})
        if request.url.path=="/history/noble01":
            return httpx.Response(200,json={"noble01":{"outputs":{"7":{"images":[{
                "filename":"result.png","type":"output","subfolder":""}]}}}})
        if request.url.path=="/view":
            data=io.BytesIO()
            Image.new("RGB",(64,64),(24,33,88)).save(data,"PNG")
            return httpx.Response(200,content=data.getvalue())
        return httpx.Response(404)


class MediaCoordinationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.fixture=FakeImages()
        self.app=create_app(Path(self.tmp.name),
                            image_transport=httpx.MockTransport(self.fixture))
        self.cm=TestClient(self.app)
        self.client=self.cm.__enter__()
        self.resources=self.app.state.resources
        self.story=self.client.post("/api/v1/stories",json={
            "title":"Una noche tranquila", "premise":"Una viajera observa una biblioteca."}).json()["id"]
        self.client.put("/api/v1/images/config",json={
            "checkpoint":"noble.safetensors"})

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.tmp.cleanup()

    def test_local_lease_blocks_uncached_comfyui_then_recovers(self):
        self.assertTrue(self.client.get("/api/v1/resources/config")
                        .json()["serialize_local_gpu"])
        acquired=asyncio.run(self.resources.claim_local_gpu("narración local"))
        self.assertTrue(acquired)
        active=self.client.get("/api/v1/resources/active").json()["active"]
        self.assertEqual(active["kind"],"narración local")
        blocked=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
            "prompt":"La biblioteca iluminada por la luz de la luna"})
        self.assertEqual(blocked.status_code,409,blocked.text)
        self.assertEqual(self.fixture.calls,0)
        self.assertEqual(self.client.get("/api/v1/resources/active")
                         .json()["active"]["kind"],"narración local")
        self.resources.release_local_gpu(acquired)
        self.assertIsNone(self.client.get("/api/v1/resources/active").json()["active"])
        success=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
            "prompt":"La biblioteca iluminada por la luz de la luna"})
        self.assertEqual(success.status_code,200,success.text)
        self.assertEqual(self.fixture.calls,1)
        self.assertIsNone(self.client.get("/api/v1/resources/active").json()["active"])

    def test_coordinator_off_does_not_take_or_release_other_lease(self):
        first=asyncio.run(self.resources.claim_local_gpu("narración local"))
        try:
            changed=self.client.put("/api/v1/resources/config",json={
                "mode":"monitor","gpu_index":0,"minimum_free_mib":3072,
                "serialize_local_gpu":False})
            self.assertEqual(changed.status_code,200,changed.text)
            second=asyncio.run(self.resources.claim_local_gpu("ComfyUI"))
            self.assertFalse(second)
            self.resources.release_local_gpu(second)
            self.assertEqual(self.client.get("/api/v1/resources/active")
                .json()["active"]["kind"],"narración local")
        finally:
            self.resources.release_local_gpu(first)
        self.assertIsNone(self.client.get("/api/v1/resources/active").json()["active"])

    def test_local_narrative_stream_busy_yields_sse_error_not_partial_turn(self):
        cfg=self.client.put("/api/v1/narrative/config",json={
            "provider":"koboldcpp","base_url":"http://127.0.0.1:5001",
            "model":"fixture-story","device":"auto"})
        self.assertEqual(cfg.status_code,200,cfg.text)
        lease=asyncio.run(self.resources.claim_local_gpu("ComfyUI"))
        try:
            response=self.client.post(f"/api/v1/stories/{self.story}/generate",json={
                "request_id":"355f045b-5d48-4495-a130-5b690fa64d77",
                "mode":"say", "input_text":"¿Quién eres?"})
            self.assertEqual(response.status_code,200)
            self.assertIn("GPU local ocupada",response.text)
            self.assertIn("event: error",response.text)
            self.assertEqual(self.client.get(
                f"/api/v1/stories/{self.story}/turns").json()["turns"],[])
        finally:
            self.resources.release_local_gpu(lease)

    def test_warmup_respects_existing_image_lease(self):
        cfg=self.client.put("/api/v1/narrative/config",json={
            "provider":"koboldcpp","base_url":"http://127.0.0.1:5001",
            "model":"fixture","device":"auto"})
        self.assertEqual(cfg.status_code,200)
        lease=asyncio.run(self.resources.claim_local_gpu("ComfyUI"))
        try:
            warm=self.client.post("/api/v1/narrative/prepare")
            self.assertEqual(warm.status_code,409,warm.text)
        finally:
            self.resources.release_local_gpu(lease)


if __name__=="__main__":
    unittest.main()
