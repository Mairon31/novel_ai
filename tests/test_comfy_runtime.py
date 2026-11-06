"""Validate untrusted ComfyUI job identifiers and output filenames."""
import asyncio
import sys
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.comfy_runtime import render, render_outputs


class ComfyGuardTests(unittest.TestCase):
    def test_valid_generation_uses_only_known_prompt_history_and_output(self):
        requests = []

        def provider(req):
            requests.append(req.url.path)
            if req.url.path == "/prompt":
                return httpx.Response(200, json={"prompt_id": "job-234"})
            if req.url.path == "/history/job-234":
                return httpx.Response(200, json={"job-234": {"outputs": {
                    "7": {"images": [{"filename": "NobleAI-Scene_0001.png",
                                      "subfolder": "", "type": "output"}]}}}})
            if req.url.path == "/view":
                return httpx.Response(200, content=b"image")
            return httpx.Response(404)
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
                return await render(client, "http://127.0.0.1:8188", {})
        self.assertEqual(asyncio.run(run()), b"image")
        self.assertEqual(requests, ["/prompt", "/history/job-234", "/view"])

    def test_two_outputs_are_fetched_from_the_same_job_without_mixing(self):
        visited = []
        def handler(request):
            visited.append(request.url.path)
            if request.url.path == "/prompt":
                return httpx.Response(200, json={"prompt_id": "sprite2"})
            if request.url.path == "/history/sprite2":
                return httpx.Response(200, json={"sprite2": {"outputs": {
                    "7": {"images": [{"filename": "art.png", "type": "output"}]},
                    "25": {"images": [{"filename": "matte.png", "type": "output"}]},
                }, "status": {"status_str": "success"}}})
            return httpx.Response(200, content=(
                b"mask" if request.url.params["filename"] == "matte.png"
                else b"image"))
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                return await render_outputs(
                    client, "http://127.0.0.1:8188", {}, ("7", "25"))
        self.assertEqual(asyncio.run(run()), {"7": b"image", "25": b"mask"})
        self.assertEqual(visited,
                         ["/prompt", "/history/sprite2", "/view", "/view"])

    def test_missing_mask_and_malicious_secondary_output_never_publish(self):
        for failure in ("missing", "path"):
            visited = []
            def handler(request):
                visited.append(request.url.path)
                if request.url.path == "/prompt":
                    return httpx.Response(200, json={"prompt_id": "sprite2"})
                return httpx.Response(200, json={"sprite2": {
                    "outputs": {
                        "7": {"images": [{"filename": "image.png", "type": "output"}]},
                        **({} if failure == "missing" else {
                            "25": {"images": [{"filename": "../elsewhere.png",
                                               "type": "output"}]}}),
                    }, "status": {"status_str": "success"}}})
            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                    return await render_outputs(
                        client, "http://127.0.0.1:8188", {}, ("7", "25"))
            with self.assertRaises(HTTPException) as context:
                asyncio.run(run())
            self.assertEqual(context.exception.status_code, 502)
            self.assertEqual(visited, ["/prompt", "/history/sprite2"])

    def test_bad_prompt_ids_are_rejected_before_history_lookup(self):
        for bad in ("../admin", "outside/asset", "job?x=1", "", "a" * 101):
            visited = []

            def provider(req):
                visited.append(req.url.path)
                return httpx.Response(200, json={"prompt_id": bad})
            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
                    return await render(client, "http://127.0.0.1:8188", {})
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(run())
            self.assertEqual(ctx.exception.status_code, 502)
            self.assertEqual(visited, ["/prompt"])

    def test_bad_output_metadata_cannot_trigger_arbitrary_view_request(self):
        for meta in (
            {"filename": "../secret.png", "subfolder": "", "type": "output"},
            {"filename": "sprite.png", "subfolder": "../other", "type": "output"},
            {"filename": "sprite.png", "subfolder": "", "type": "input"},
            {"filename": "sprite/else.png", "subfolder": "", "type": "output"},
        ):
            visited = []

            def provider(req):
                visited.append(req.url.path)
                if req.url.path == "/prompt":
                    return httpx.Response(200, json={"prompt_id": "safejob"})
                return httpx.Response(200, json={"safejob": {
                    "outputs": {"7": {"images": [meta]}}}})
            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
                    return await render(client, "http://127.0.0.1:8188", {})
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(run())
            self.assertEqual(ctx.exception.status_code, 502)
            self.assertEqual(visited, ["/prompt", "/history/safejob"])


if __name__ == "__main__":
    unittest.main()
