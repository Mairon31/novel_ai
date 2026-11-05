"""GPU resource monitor/admission contracts without requiring a CUDA device.

These tests intentionally mock nvidia-smi; they do not benchmark GPUs.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app
from noble_api.resource_policy import gpu_snapshot


def gpu(free: int = 1900) -> list[dict]:
    return [{"index": 0, "name": "Test NVIDIA T4", "total_mib": 15360,
             "used_mib": 15360-free, "free_mib": free,
             "gpu_utilization_percent": 7}]


class GuardFixture:
    def __init__(self):
        self.prompt_calls = 0

    def __call__(self, request):
        if request.url.path == "/models/checkpoints":
            return httpx.Response(200, json=["model.safetensors"])
        if request.url.path == "/prompt":
            self.prompt_calls += 1
            return httpx.Response(200, json={"prompt_id": "a1"})
        if request.url.path == "/history/a1":
            from PIL import Image
            import io
            output=io.BytesIO()
            Image.new("RGB",(50,70),(90,70,60)).save(output,"PNG")
            return httpx.Response(200,json={"a1":{"outputs":{
                "7":{"images":[{"filename":"image.png","type":"output","subfolder":""}]}}}})
        if request.url.path == "/view":
            from PIL import Image
            import io
            output=io.BytesIO()
            Image.new("RGB",(50,70),(90,70,60)).save(output,"PNG")
            return httpx.Response(200, content=output.getvalue())
        return httpx.Response(404)


class ResourcePolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fixture = GuardFixture()
        self.app = create_app(Path(self.tmp.name),
                              image_transport=httpx.MockTransport(self.fixture))
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        self.story = self.client.post("/api/v1/stories",json={
            "title":"La casa lunar", "premise":"La viajera busca una ciudad entre dos montañas."}).json()["id"]
        config = self.client.put("/api/v1/images/config",json={
            "checkpoint":"model.safetensors",
        })
        self.assertEqual(config.status_code,200,config.text)

    def tearDown(self):
        self.cm.__exit__(None,None,None)
        self.tmp.cleanup()

    def test_gpu_parser_observed_only(self):
        import subprocess
        completed=subprocess.CompletedProcess(args=[],returncode=0,
            stdout="0, NVIDIA GPU, 16384, 11984, 4400, 33\n", stderr="")
        with patch("noble_api.resource_policy.subprocess.run", return_value=completed):
            result=gpu_snapshot()
        self.assertEqual(result[0]["index"],0)
        self.assertEqual(result[0]["free_mib"],4400)
        self.assertEqual(result[0]["used_mib"],11984)
        with patch("noble_api.resource_policy.subprocess.run", side_effect=FileNotFoundError):
            self.assertEqual(gpu_snapshot(),[])

    def test_status_does_not_start_any_generation_and_guard_persists(self):
        with patch("noble_api.resource_policy.gpu_snapshot",return_value=gpu()):
            original=self.client.get("/api/v1/resources/status").json()
            self.assertTrue(original["monitor_only"])
            self.assertEqual(original["status"],"below_reserve")
            self.assertEqual(self.fixture.prompt_calls,0)
            configured=self.client.put("/api/v1/resources/config",json={
                "mode":"guard", "gpu_index":0, "minimum_free_mib":3500})
            self.assertEqual(configured.status_code,200,configured.text)
            status=self.client.get("/api/v1/resources/status").json()
            self.assertFalse(status["monitor_only"])
            self.assertEqual(status["selected_gpu"]["free_mib"],1900)
            blocked=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
                "prompt":"Un castillo bajo la luna brillante"})
            self.assertEqual(blocked.status_code,409,blocked.text)
            self.assertEqual(self.fixture.prompt_calls,0)

            approved=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
                "prompt":"Un castillo bajo la luna brillante", "allow_low_vram":True})
            self.assertEqual(approved.status_code,200,approved.text)
            self.assertEqual(self.fixture.prompt_calls,1)

        recreated=create_app(Path(self.tmp.name))
        with TestClient(recreated) as second:
            self.assertEqual(second.get("/api/v1/resources/config").json()["mode"],"guard")
            bad=second.put("/api/v1/resources/config",json={
                "mode":"nuke_processes","gpu_index":0,"minimum_free_mib":3000})
            self.assertEqual(bad.status_code,422)

    def test_no_gpu_detected_never_claims_free_vram_or_blocks_cpu(self):
        self.client.put("/api/v1/resources/config",json={
            "mode":"guard", "gpu_index":0, "minimum_free_mib":3500})
        with patch("noble_api.resource_policy.gpu_snapshot",return_value=[]):
            result=self.client.get("/api/v1/resources/status").json()
            self.assertEqual(result["status"],"unknown")
            self.assertIsNone(result["selected_gpu"])
            response=self.client.post(f"/api/v1/stories/{self.story}/illustrate",json={
                "prompt":"Un castillo bajo la luna brillante"})
            self.assertEqual(response.status_code,200,response.text)


if __name__ == "__main__":
    unittest.main()
