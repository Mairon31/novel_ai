"""Native IPAdapter Plus node contracts, missing plugins and model guards."""
import asyncio
import sys
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.comfy_identity_adapter import (
    DEFAULT_PRESET, inject_ipadapter, identity_adapter_status,
    require_ipadapter_status, validate_identity_adapter_nodes)
from noble_api.images import workflow


def registry(name):
    if name == "IPAdapterUnifiedLoader":
        return {"input": {"required": {
            "model": ["MODEL"], "preset": [[DEFAULT_PRESET,
                                           "STANDARD (medium strength)"]]}}}
    return {"input": {"required": {key: [] for key in (
        "model", "ipadapter", "image", "weight", "start_at",
        "end_at", "weight_type")}}}


class AdapterGraphTests(unittest.TestCase):
    def setUp(self):
        self.config = {"checkpoint": "novel.safetensors", "width": 256,
                       "height": 256, "steps": 14, "cfg": 6.5,
                       "negative_prompt": "negative"}

    def test_plus_face_graph_uses_reference_only_for_model_conditioning(self):
        nodes = workflow(self.config, "portrait anime green", 1109)
        inject_ipadapter(nodes, "portrait.png", DEFAULT_PRESET, 0.65)
        self.assertEqual(nodes["20"]["class_type"], "IPAdapterUnifiedLoader")
        self.assertEqual(nodes["20"]["inputs"]["model"], ["1", 0])
        self.assertEqual(nodes["21"]["inputs"]["image"], "portrait.png")
        self.assertEqual(nodes["22"]["class_type"], "IPAdapter")
        self.assertEqual(nodes["22"]["inputs"]["ipadapter"], ["20", 1])
        self.assertEqual(nodes["22"]["inputs"]["image"], ["21", 0])
        self.assertEqual(nodes["22"]["inputs"]["weight"], 0.65)
        self.assertEqual(nodes["5"]["inputs"]["model"], ["22", 0])
        self.assertEqual(nodes["5"]["inputs"]["latent_image"], ["4", 0])
        self.assertNotIn("8", nodes)
        self.assertEqual(nodes["2"]["inputs"]["clip"], ["1", 1])

    def test_composes_after_lora_and_not_with_img2img(self):
        nodes = workflow(self.config, "portrait anime green", 1234,
                         lora_stack=[{"lora_name": "aira.safetensors",
                                      "strength": 0.7}])
        inject_ipadapter(nodes, "portrait.png", DEFAULT_PRESET, 0.8)
        self.assertEqual(nodes["20"]["inputs"]["model"], ["10", 0])
        self.assertEqual(nodes["5"]["inputs"]["model"], ["22", 0])
        self.assertEqual(nodes["2"]["inputs"]["clip"], ["10", 1])
        self.assertEqual(nodes["5"]["inputs"]["latent_image"], ["4", 0])

    def test_invalid_preset_strength_filename_are_rejected(self):
        for preset, strength, filename in (
            ("FACEID", 0.7, "portrait.png"),
            (DEFAULT_PRESET, 0, "portrait.png"),
            (DEFAULT_PRESET, 1.51, "portrait.png"),
            (DEFAULT_PRESET, 0.6, "../evil.png"),
        ):
            with self.assertRaises(ValueError):
                inject_ipadapter(workflow(self.config, "portrait", 4),
                                 filename, preset, strength)

    def test_node_schema_checks_presets(self):
        presets = validate_identity_adapter_nodes(
            registry("IPAdapterUnifiedLoader"), registry("IPAdapter"))
        self.assertIn(DEFAULT_PRESET, presets)
        with self.assertRaisesRegex(ValueError, "IPAdapter"):
            validate_identity_adapter_nodes(
                registry("IPAdapterUnifiedLoader"), {})

    def test_status_only_checks_local_nodes_models_no_generation(self):
        seen = []
        def router(request):
            seen.append(request.url.path)
            name = request.url.path.split("/")[-1]
            if request.url.path.startswith("/object_info/"):
                return httpx.Response(200, json={name: registry(name)})
            if request.url.path.startswith("/models/"):
                return httpx.Response(200, json=["installed.safetensors"])
            return httpx.Response(404)
        result = asyncio.run(identity_adapter_status(
            "http://127.0.0.1:8188", httpx.MockTransport(router)))
        self.assertTrue(result["available"], result)
        self.assertIn(DEFAULT_PRESET, result["presets"])
        self.assertEqual(result["model_count"], 1)
        self.assertEqual(result["clip_vision_count"], 1)
        self.assertEqual(len(seen), 4)
        self.assertFalse(any(path == "/prompt" for path in seen))
        require_ipadapter_status(result, DEFAULT_PRESET)

    def test_missing_node_or_model_inventory_fails_without_fallback(self):
        for absent in ("IPAdapter", "clip_vision"):
            def router(request):
                name = request.url.path.split("/")[-1]
                if name == absent:
                    return httpx.Response(404) if absent == "IPAdapter"                         else httpx.Response(200, json=[])
                if request.url.path.startswith("/object_info/"):
                    return httpx.Response(200, json={name: registry(name)})
                return httpx.Response(200, json=["installed.safetensors"])
            result = asyncio.run(identity_adapter_status(
                "http://127.0.0.1:8188", httpx.MockTransport(router)))
            self.assertFalse(result["available"])
            with self.assertRaises(HTTPException) as ctx:
                require_ipadapter_status(result, DEFAULT_PRESET)
            self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
