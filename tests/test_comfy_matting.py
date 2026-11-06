"""One-run alpha matte graph and strict local model preflight."""
import asyncio
import sys
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.comfy_matting import (
    ALL_MODES, CHROMA, MODELS, inject_matte, matting_status,
    require_matting_mode)
from noble_api.images import workflow


def node_info(name: str) -> dict:
    if name == "MaskToImage":
        return {"input": {"required": {"mask": ["MASK"]}}}
    fields = {
        "sensitivity": ["FLOAT"], "mask_blur": ["INT"],
        "mask_offset": ["INT"], "invert_output": ["BOOLEAN"],
        "refine_foreground": ["BOOLEAN"], "unload_model": ["BOOLEAN"],
        "background": [["Alpha", "Color"]],
        "background_color": ["COLORCODE"],
        "process_res": ["INT"],
    }
    return {"input": {
        "required": {"image": ["IMAGE"],
                     "model": [["RMBG-2.0", "BiRefNet-portrait",
                                "BiRefNet-matting"]]},
        "optional": fields,
    }}


def models_in_inventory():
    return sorted(set(name for item in MODELS.values()
                      for name in item["expected"]))


class MattingWorkflowTests(unittest.TestCase):
    config = {"checkpoint": "novel.safetensors", "width": 256,
              "height": 256, "steps": 10, "cfg": 6,
              "negative_prompt": "watermark"}

    def test_secondary_output_is_mask_image_and_primary_is_processed_rgba(self):
        for mode, spec in MODELS.items():
            with self.subTest(mode=mode):
                graph = workflow(self.config, "character", 42)
                inject_matte(graph, mode)
                self.assertEqual(graph["23"]["class_type"], spec["class"])
                self.assertEqual(graph["23"]["inputs"]["model"], spec["model"])
                self.assertEqual(graph["23"]["inputs"]["image"], ["6", 0])
                self.assertEqual(graph["23"]["inputs"]["background"], "Alpha")
                self.assertEqual(graph["7"]["inputs"]["images"], ["23", 0])
                self.assertEqual(graph["24"]["inputs"]["mask"], ["23", 1])
                self.assertEqual(graph["25"]["class_type"], "SaveImage")
                self.assertEqual(graph["25"]["inputs"]["images"], ["24", 0])

    def test_default_chroma_does_not_insert_nodes(self):
        graph = workflow(self.config, "character", 42)
        self.assertNotIn("23", graph)
        self.assertEqual(graph["7"]["inputs"]["images"], ["6", 0])
        with self.assertRaises(ValueError):
            inject_matte(graph, CHROMA)

    def test_inventory_preflight_recognizes_installed_files_only(self):
        calls = []
        def handler(request):
            calls.append(request.url.path)
            name = request.url.path.split("/")[-1]
            if request.url.path.startswith("/object_info/"):
                return httpx.Response(200, json={name: node_info(name)})
            if request.url.path == "/models/rmbg":
                return httpx.Response(200, json=models_in_inventory())
            return httpx.Response(404)
        available = asyncio.run(matting_status(
            "http://127.0.0.1:8188", httpx.MockTransport(handler)))
        self.assertTrue(available["neural_available"])
        self.assertTrue(all(x["ready"] for x in available["modes"]))
        self.assertEqual(calls, [
            "/object_info/RMBG", "/object_info/BiRefNetRMBG",
            "/object_info/MaskToImage", "/models/rmbg"])
        for mode in ALL_MODES:
            require_matting_mode(available, mode)

    def test_missing_weights_or_node_fails_without_fallback(self):
        for kind in ("weight", "MaskToImage", "RMBG"):
            with self.subTest(kind=kind):
                def handler(request):
                    name = request.url.path.split("/")[-1]
                    if name == kind and kind != "weight":
                        return httpx.Response(404)
                    if request.url.path.startswith("/object_info/"):
                        return httpx.Response(200, json={name: node_info(name)})
                    if request.url.path == "/models/rmbg":
                        files = models_in_inventory()
                        if kind == "weight":
                            files.remove("RMBG-2.0/model.safetensors")
                        return httpx.Response(200, json=files)
                    return httpx.Response(404)
                available = asyncio.run(matting_status(
                    "http://127.0.0.1:8188", httpx.MockTransport(handler)))
                self.assertFalse(next(x for x in available["modes"] if
                                      x["mode"] == "neural_rmbg2")["ready"])
                with self.assertRaises(HTTPException) as context:
                    require_matting_mode(available, "neural_rmbg2")
                self.assertEqual(context.exception.status_code, 422)
                self.assertIn("Recorte neuronal", context.exception.detail)

    def test_malformed_inventory_does_not_trigger_generation(self):
        def handler(request):
            name = request.url.path.split("/")[-1]
            if request.url.path.startswith("/object_info/"):
                return httpx.Response(200, json={name: node_info(name)})
            return httpx.Response(200, json={"path": "../strange"})
        available = asyncio.run(matting_status(
            "http://127.0.0.1:8188", httpx.MockTransport(handler)))
        self.assertFalse(available["neural_available"])
        self.assertTrue(available["modes"][0]["ready"])


if __name__ == "__main__":
    unittest.main()
