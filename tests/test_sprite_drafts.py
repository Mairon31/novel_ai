"""End-to-end sprite draft contract with a mocked local ComfyUI.

Checks five real HTTP render workflows, local alpha conversion, ownership,
resumability, explicit approval, and cleanup without requiring GPU hardware.
"""
from __future__ import annotations

import io
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from noble_api.main import create_app
from noble_api.creator_media import EXPRESSIONS
from noble_api.sprite_drafts import DRAFT_TTL
from noble_api.comfy_matting import MODELS


def sprite_png(bad_background=False, horizontal_offset=0):
    photo = Image.new("RGB", (256, 256),
                      (75, 80, 90) if bad_background else (4, 245, 8))
    ImageDraw.Draw(photo).ellipse((85 + horizontal_offset, 35,
                                   170 + horizontal_offset, 228),
                                  fill=(203, 87, 130))
    buf = io.BytesIO()
    photo.save(buf, "PNG")
    return buf.getvalue()


def mock_mask_png(invalid=False):
    mask = Image.new("L", (256, 256), 0)
    if not invalid:
        ImageDraw.Draw(mask).ellipse((85, 35, 170, 228), fill=255)
    buf = io.BytesIO()
    mask.save(buf, "PNG")
    return buf.getvalue()


def mock_matte_node(name):
    if name == "MaskToImage":
        return {"input": {"required": {"mask": ["MASK"]}}}
    return {"input": {
        "required": {"image": ["IMAGE"], "model": [[
            "RMBG-2.0", "BiRefNet-portrait", "BiRefNet-matting"]]},
        "optional": {
            "sensitivity": ["FLOAT"], "mask_blur": ["INT"],
            "mask_offset": ["INT"], "invert_output": ["BOOLEAN"],
            "refine_foreground": ["BOOLEAN"], "unload_model": ["BOOLEAN"],
            "background": [["Alpha", "Color"]],
            "background_color": ["COLORCODE"], "process_res": ["INT"]}}}


class SpriteComfy:
    def __init__(self):
        self.history = []
        self.graphs = []
        self.bad_background = False
        self.offline = False
        self.missing_lora = False
        self.ipadapter_unavailable = False
        self.ipadapter_weights_missing = False
        self.horizontal_offset = 0
        self.last_upload = None
        self.matte_node_missing = False
        self.matte_weights_missing = False
        self.matte_mask_missing = False
        self.matte_mask_invalid = False

    def __call__(self, request: httpx.Request):
        self.history.append(request)
        path = request.url.path
        if self.offline:
            return httpx.Response(503)
        if path == "/models/checkpoints":
            return httpx.Response(200, json=["novel.safetensors"])
        if path == "/models/loras":
            return httpx.Response(200, json=[
                "absent.safetensors" if self.missing_lora else "aira.safetensors"])
        if path == "/object_info/LoraLoader":
            return httpx.Response(200, json={"LoraLoader": {"input": {
                "required": {name: [] for name in (
                    "model", "clip", "lora_name", "strength_model", "strength_clip")}}}})
        if path == "/object_info/IPAdapterUnifiedLoader":
            if self.ipadapter_unavailable:
                return httpx.Response(404)
            return httpx.Response(200, json={"IPAdapterUnifiedLoader": {"input": {
                "required": {"model": ["MODEL"], "preset": [[
                    "STANDARD (medium strength)", "PLUS (high strength)",
                    "PLUS FACE (portraits)"]]}}}})
        if path == "/object_info/IPAdapter":
            if self.ipadapter_unavailable:
                return httpx.Response(404)
            return httpx.Response(200, json={"IPAdapter": {"input": {
                "required": {field: [] for field in (
                    "model", "ipadapter", "image", "weight", "start_at",
                    "end_at", "weight_type")}}}})
        if path.startswith("/object_info/") and path.rsplit("/", 1)[-1] in (
                "RMBG", "BiRefNetRMBG", "MaskToImage"):
            name = path.rsplit("/", 1)[-1]
            if self.matte_node_missing and name in ("RMBG", "BiRefNetRMBG"):
                return httpx.Response(404)
            return httpx.Response(200, json={name: mock_matte_node(name)})
        if path == "/models/rmbg":
            files = sorted(set(file for spec in MODELS.values()
                               for file in spec["expected"]))
            if self.matte_weights_missing:
                files = [name for name in files
                         if name != "RMBG-2.0/model.safetensors"]
            return httpx.Response(200, json=files)
        if path in {"/models/ipadapter", "/models/clip_vision"}:
            return httpx.Response(200, json=[] if self.ipadapter_weights_missing else
                                  ["mock-model.safetensors"])
        if path == "/upload/image":
            self.last_upload = request.content
            return httpx.Response(200, json={"name": "reference.png"})
        if path == "/prompt":
            graph = json.loads(request.content)["prompt"]
            self.graphs.append(graph)
            return httpx.Response(200, json={"prompt_id": "sprite-job"})
        if path == "/history/sprite-job":
            outputs = {"7": {"images": [
                {"filename": "sprite.png", "subfolder": "", "type": "output"}]}}
            if (self.graphs and "25" in self.graphs[-1] and
                    not self.matte_mask_missing):
                outputs["25"] = {"images": [
                    {"filename": "matte.png", "subfolder": "", "type": "output"}]}
            return httpx.Response(200, json={"sprite-job": {"outputs": outputs,
                "status": {"status_str": "success"}}})
        if path == "/view":
            if request.url.params.get("filename") == "matte.png":
                return httpx.Response(200, content=mock_mask_png(
                    self.matte_mask_invalid))
            return httpx.Response(200, content=sprite_png(
                self.bad_background or bool(self.graphs and
                    "25" in self.graphs[-1]), self.horizontal_offset))
        return httpx.Response(404)


class SpriteDraftApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mock = SpriteComfy()
        self.root = Path(self.tmp.name)
        self.transport = httpx.MockTransport(self.mock)
        self.app = create_app(self.root, image_transport=self.transport)
        self.ctx = TestClient(self.app)
        self.client = self.ctx.__enter__()
        res = self.client.post("/api/v1/stories", json={
            "title": "Expresiones de Aira",
            "premise": "Aira cuida las llaves de la biblioteca antigua del reino.",
            "protagonist_name": "Luna",
        })
        self.assertEqual(res.status_code, 201, res.text)
        self.story = res.json()["id"]
        npc = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters", json={
                "name": "Aira",
                "description": "Aira es una heroína de cabello negro largo y ojos grises.",
                "visual_dna": {"tags": ["cabello negro", "ojos grises"],
                               "seed": 712, "lora_name": "aira.safetensors",
                               "lora_strength": 0.78},
            })
        self.assertEqual(npc.status_code, 201, npc.text)
        self.npc = npc.json()["id"]
        configured = self.client.put("/api/v1/images/config", json={
            "provider": "comfyui", "base_url": "http://127.0.0.1:8188",
            "checkpoint": "novel.safetensors", "width": 256, "height": 256,
            "steps": 10, "cfg": 6, "negative_prompt": "watermark"})
        self.assertEqual(configured.status_code, 200, configured.text)

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.tmp.cleanup()

    def url(self, rest=""):
        return f"/api/v1/stories/{self.story}/creator/sprite-drafts" + rest

    def draft(self, **overrides):
        body = {"caption": "Aira hablando en biblioteca antigua",
                "pose": "standing", "style": "elegant Japanese anime", **overrides}
        created = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters/{self.npc}/sprite-drafts",
            json=body)
        self.assertEqual(created.status_code, 201, created.text)
        return created.json()

    def generate(self, draft, expression):
        return self.client.post(self.url(
            f"/{draft['id']}/expressions/{expression}"), json={})

    def test_create_is_offline_and_generation_requires_explicit_steps(self):
        draft = self.draft()
        self.assertEqual(draft["character_name"], "Aira")
        self.assertEqual(draft["seed"], 712)
        self.assertEqual(draft["ready_count"], 0)
        self.assertFalse(self.mock.history)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])
        self.assertEqual(len(self.client.get(self.url()).json()["drafts"]), 1)
        response = self.generate(draft, "neutral")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["ready_count"], 1)
        self.assertTrue(response.json()["slots"]["neutral"]["quality"][
            "requires_author_review"])
        png = self.client.get(
            response.json()["slots"]["neutral"]["preview_url"])
        self.assertEqual(png.status_code, 200, png.text)
        self.assertEqual(png.headers["cache-control"], "no-store")
        with Image.open(io.BytesIO(png.content)) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertGreater(image.getpixel((128, 120))[3], 240)
        self.assertEqual(self.mock.graphs[0]["5"]["inputs"]["seed"], 712)
        self.assertIn("neutral expression", self.mock.graphs[0]["2"]["inputs"]["text"])
        self.assertNotIn("10", self.mock.graphs[0])
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])

    def test_five_render_steps_need_explicit_approval_for_atomic_publication(self):
        draft = self.draft()
        for index, expression in enumerate(EXPRESSIONS):
            result = self.generate(draft, expression)
            self.assertEqual(result.status_code, 200, (expression, result.text))
            self.assertEqual(result.json()["ready_count"], index + 1)
        self.assertEqual(len(self.mock.graphs), 5)
        self.assertTrue(all("no sprite sheet" in graph["2"]["inputs"]["text"]
                            for graph in self.mock.graphs))
        media_before = self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()
        self.assertEqual(len(media_before["assets"]), 0)
        approval = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(approval.status_code, 200, approval.text)
        self.assertTrue(approval.json()["approved"])
        self.assertEqual(approval.json()["count"], 5)
        saved = self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]
        self.assertEqual({a["expression"] for a in saved}, set(EXPRESSIONS))
        self.assertEqual({a["source"] for a in saved}, {"ai_reviewed"})
        self.assertTrue(all(a["generation_details"]["quality"]["author_approved"]
                            for a in saved))
        self.assertTrue(all(a["generation_details"]["seed"] == 712 for a in saved))
        self.assertTrue(all(a["character_id"] == self.npc for a in saved))
        self.assertTrue(all(a["media_type"] == "image/png" for a in saved))
        self.assertEqual(self.client.get(self.url()).json()["drafts"], [])
        self.assertFalse((self.root / "sprite-drafts" /
                          self.story / draft["id"]).exists())

    def test_generation_failures_keep_existing_slot_and_no_partial_art(self):
        draft = self.draft()
        ok = self.generate(draft, "neutral")
        self.assertEqual(ok.status_code, 200, ok.text)
        preview = ok.json()["slots"]["neutral"]["preview_url"]
        original = self.client.get(preview).content
        self.mock.bad_background = True
        denied = self.generate(draft, "neutral")
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertIn("Recorte no aceptado", denied.text)
        self.assertEqual(self.client.get(preview).content, original)
        self.mock.bad_background = False
        self.mock.offline = True
        absent = self.generate(draft, "joy")
        self.assertEqual(absent.status_code, 503, absent.text)
        self.assertEqual(self.client.get(self.url(
            f"/{draft['id']}")).json()["ready_count"], 1)
        denied_approve = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(denied_approve.status_code, 422, denied_approve.text)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]), 0)

    def test_resume_after_app_recreation_and_discard(self):
        draft = self.draft()
        first = self.generate(draft, "neutral")
        self.assertEqual(first.status_code, 200, first.text)
        with TestClient(create_app(self.root, image_transport=self.transport)) as resumed:
            listing = resumed.get(self.url())
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertEqual(listing.json()["drafts"][0]["ready_count"], 1)
            preview = resumed.get(
                listing.json()["drafts"][0]["slots"]["neutral"]["preview_url"])
            self.assertEqual(preview.status_code, 200)
            discarded = resumed.delete(self.url(f"/{draft['id']}"))
            self.assertEqual(discarded.status_code, 204, discarded.text)
        self.assertEqual(self.client.get(self.url()).json()["drafts"], [])
        self.assertFalse((self.root / "sprite-drafts" /
                          self.story / draft["id"]).exists())

    def test_story_ownership_and_expired_preview_cleanup(self):
        draft = self.draft()
        self.assertEqual(self.generate(draft, "neutral").status_code, 200)
        other = self.client.post("/api/v1/stories", json={
            "title": "Otro relato", "premise":
                "Una ciudad flotante despierta bajo una tormenta distante.",
        })
        self.assertEqual(other.status_code, 201, other.text)
        foreign_url = f"/api/v1/stories/{other.json()['id']}/creator/sprite-drafts/{draft['id']}"
        self.assertEqual(self.client.get(foreign_url).status_code, 404)
        self.assertEqual(self.client.get(
            foreign_url + "/expressions/neutral/preview").status_code, 404)
        self.assertEqual(self.client.post(foreign_url + "/approve").status_code, 422)
        self.assertEqual(self.client.delete(foreign_url).status_code, 404)
        with self.app.state.store._conn() as db:
            db.execute("UPDATE sprite_drafts SET updated_at=? WHERE id=?",
                       (time.time() - DRAFT_TTL - 10, draft["id"]))
        self.assertEqual(self.client.get(self.url()).json()["drafts"], [])
        self.assertFalse((self.root / "sprite-drafts" /
                          self.story / draft["id"]).exists())

    def test_lora_is_opt_in_and_input_reference_is_story_owned(self):
        frame = sprite_png()
        uploaded = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("portrait.png", frame, "image/png")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        art = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        draft = self.draft(use_lora=True, reference_asset_id=art)
        done = self.generate(draft, "joy")
        self.assertEqual(done.status_code, 200, done.text)
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["10"]["class_type"], "LoraLoader")
        self.assertEqual(graph["10"]["inputs"]["lora_name"], "aira.safetensors")
        self.assertEqual(graph["2"]["inputs"]["clip"], ["10", 1])
        self.assertEqual(graph["5"]["inputs"]["latent_image"], ["9", 0])
        self.assertIn("LoadImage", [node["class_type"] for node in graph.values()])
        self.assertIsNotNone(self.mock.last_upload)
        self.mock.missing_lora = True
        rejected = self.generate(draft, "anger")
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertEqual(len(self.mock.graphs), 1)
        other = self.client.post("/api/v1/stories", json={
            "title": "Historia ajena", "premise":
                "Un pueblo solitario escucha canciones al anochecer.",
        }).json()["id"]
        other_npc = self.client.post(
            f"/api/v1/stories/{other}/creator/characters", json={
                "name": "Bel", "description":
                    "Bel vive entre montañas nevadas y protege su pueblo."})
        self.assertEqual(other_npc.status_code, 201, other_npc.text)
        bad = self.client.post(
            f"/api/v1/stories/{other}/creator/characters/{other_npc.json()['id']}/sprite-drafts",
            json={"caption": "Bel en su pueblo", "reference_asset_id": art})
        self.assertEqual(bad.status_code, 422, bad.text)

    def test_ipadapter_graph_uses_owned_gallery_without_img2img_and_composes_lora(self):
        frame = sprite_png()
        uploaded = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("portrait.png", frame, "image/png")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        ident = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        draft = self.draft(
            reference_asset_id=ident, reference_mode="ipadapter",
            use_lora=True, ipadapter_preset="PLUS FACE (portraits)",
            ipadapter_weight=0.63)
        self.assertEqual(draft["reference_mode"], "ipadapter")
        self.assertEqual(draft["ipadapter_weight"], 0.63)
        self.assertFalse(self.mock.history)
        result = self.generate(draft, "joy")
        self.assertEqual(result.status_code, 200, result.text)
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["10"]["class_type"], "LoraLoader")
        self.assertEqual(graph["20"]["class_type"], "IPAdapterUnifiedLoader")
        self.assertEqual(graph["20"]["inputs"]["model"], ["10", 0])
        self.assertEqual(graph["21"]["class_type"], "LoadImage")
        self.assertEqual(graph["22"]["class_type"], "IPAdapter")
        self.assertEqual(graph["22"]["inputs"]["weight"], 0.63)
        self.assertEqual(graph["5"]["inputs"]["model"], ["22", 0])
        self.assertEqual(graph["5"]["inputs"]["latent_image"], ["4", 0])
        self.assertEqual(graph["2"]["inputs"]["clip"], ["10", 1])
        self.assertNotIn("8", graph)
        self.assertNotIn("9", graph)
        self.assertIsNotNone(self.mock.last_upload)

    def test_ipadapter_status_and_missing_plugin_or_weights_fail_before_prompt(self):
        endpoint = "/api/v1/images/identity-adapter/status"
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["available"])
        self.assertIn("PLUS FACE (portraits)", response.json()["presets"])
        self.assertFalse(any(r.url.path == "/prompt" for r in self.mock.history))
        frame = sprite_png()
        uploaded = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("portrait.png", frame, "image/png")})
        self.assertEqual(uploaded.status_code, 200)
        ident = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        draft = self.draft(reference_asset_id=ident, reference_mode="ipadapter")
        for key in ("ipadapter_unavailable", "ipadapter_weights_missing"):
            setattr(self.mock, key, True)
            response = self.generate(draft, "neutral")
            self.assertEqual(response.status_code, 422, (key, response.text))
            self.assertIn("IPAdapter", response.text)
            self.assertEqual(len(self.mock.graphs), 0)
            setattr(self.mock, key, False)
        final = self.generate(draft, "neutral")
        self.assertEqual(final.status_code, 200, final.text)

    def test_ipadapter_rejects_missing_and_wrong_story_sprite_references(self):
        without = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters/{self.npc}/sprite-drafts",
            json={"caption": "Aira en biblioteca",
                  "reference_mode": "ipadapter"})
        self.assertEqual(without.status_code, 422, without.text)
        image = self.app.state.creator_media.add(
            self.story, "foreground", "Aira", "Aira bosque mágico",
            sprite_png(), self.npc)
        other_npc = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters",
            json={"name": "Bel", "description":
                  "Bel protege la aldea junto al río y vive en el molino."})
        self.assertEqual(other_npc.status_code, 201)
        invalid = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters/{other_npc.json()['id']}/sprite-drafts",
            json={"caption": "Bel en biblioteca",
                  "reference_sprite_asset_id": image["id"],
                  "reference_mode": "ipadapter"})
        self.assertEqual(invalid.status_code, 422)
        self.assertIn("mismo NPC", invalid.text)
        twice = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters/{self.npc}/sprite-drafts",
            json={"caption": "Aira en biblioteca", "reference_asset_id": image["id"],
                  "reference_sprite_asset_id": image["id"],
                  "reference_mode": "ipadapter"})
        self.assertEqual(twice.status_code, 422)
        correct = self.draft(reference_sprite_asset_id=image["id"],
                             reference_mode="ipadapter")
        self.assertEqual(correct["reference_sprite_asset_id"], image["id"])
        self.assertEqual(self.generate(correct, "neutral").status_code, 200)
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["5"]["inputs"]["latent_image"], ["4", 0])
        self.app.state.creator_media.delete(self.story, image["id"])
        response = self.generate(correct, "anger")
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(len(self.mock.graphs), 1)

    def test_approved_sprite_reference_supports_standard_img2img(self):
        sprite = self.app.state.creator_media.add(
            self.story, "foreground", "Aira retrato", "Aira en jardín",
            sprite_png(), self.npc)
        draft = self.draft(reference_sprite_asset_id=sprite["id"])
        result = self.generate(draft, "neutral")
        self.assertEqual(result.status_code, 200, result.text)
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["5"]["inputs"]["latent_image"], ["9", 0])
        self.assertIn("8", graph)
        self.assertNotIn("20", graph)
        self.assertIsNotNone(self.mock.last_upload)

    def test_ipadapter_provenance_is_published_only_after_author_approves(self):
        frame = sprite_png()
        uploaded = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("portrait.png", frame, "image/png")})
        self.assertEqual(uploaded.status_code, 200)
        ident = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        draft = self.draft(reference_asset_id=ident, reference_mode="ipadapter",
                           ipadapter_weight=0.52)
        for expression in EXPRESSIONS:
            self.assertEqual(self.generate(draft, expression).status_code, 200)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])
        published = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(published.status_code, 200, published.text)
        self.assertEqual(published.json()["count"], 5)
        for sprite in published.json()["assets"]:
            self.assertEqual(sprite["generation_details"]["workflow_version"],
                             "comfy-sprite-v2-ipadapter")
            self.assertEqual(sprite["generation_details"]["adapter"]["weight"], 0.52)
            self.assertEqual(sprite["generation_details"]["adapter"]["reference_kind"],
                             "gallery")

    def test_neural_rmbg_uses_two_outputs_and_keeps_soft_mask(self):
        listing = self.client.get("/api/v1/images/matting/status")
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertTrue(listing.json()["neural_available"])
        self.assertEqual(len(self.mock.graphs), 0)
        draft = self.draft(cutout_mode="neural_rmbg2")
        self.assertEqual(draft["cutout_mode"], "neural_rmbg2")
        result = self.generate(draft, "neutral")
        self.assertEqual(result.status_code, 200, result.text)
        report = result.json()["slots"]["neutral"]["quality"]
        self.assertEqual(report["method"], "neural_rmbg")
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["23"]["class_type"], "RMBG")
        self.assertEqual(graph["23"]["inputs"]["background"], "Alpha")
        self.assertEqual(graph["7"]["inputs"]["images"], ["23", 0])
        self.assertEqual(graph["24"]["inputs"]["mask"], ["23", 1])
        self.assertEqual(graph["25"]["inputs"]["images"], ["24", 0])
        preview = self.client.get(result.json()["slots"]["neutral"]["preview_url"])
        self.assertEqual(preview.status_code, 200, preview.text)
        with Image.open(io.BytesIO(preview.content)) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertEqual(image.getpixel((128, 128))[3], 255)

    def test_neural_mask_missing_invalid_fails_without_publishing(self):
        draft = self.draft(cutout_mode="neural_rmbg2")
        self.mock.matte_mask_missing = True
        missing = self.generate(draft, "neutral")
        self.assertEqual(missing.status_code, 502, missing.text)
        self.assertIn("máscara", missing.text)
        self.mock.matte_mask_missing = False
        self.mock.matte_mask_invalid = True
        rejected = self.generate(draft, "neutral")
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertIn("Máscara neuronal", rejected.text)
        self.assertEqual(self.client.get(self.url(
            f"/{draft['id']}")).json()["ready_count"], 0)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])

    def test_matting_model_or_node_absent_fails_before_prompt(self):
        draft = self.draft(cutout_mode="neural_rmbg2")
        for name in ("matte_weights_missing", "matte_node_missing"):
            setattr(self.mock, name, True)
            denied = self.generate(draft, "neutral")
            self.assertEqual(denied.status_code, 422, (name, denied.text))
            self.assertEqual(len(self.mock.graphs), 0)
            setattr(self.mock, name, False)
        accepted = self.generate(draft, "neutral")
        self.assertEqual(accepted.status_code, 200, accepted.text)

    def test_birefnet_portrait_neural_approval_has_versioned_model_provenance(self):
        draft = self.draft(cutout_mode="neural_birefnet_portrait")
        for expression in EXPRESSIONS:
            generated = self.generate(draft, expression)
            self.assertEqual(generated.status_code, 200, generated.text)
            self.assertEqual(generated.json()["slots"][expression]["quality"][
                "method"], "neural_birefnet")
            self.assertEqual(self.mock.graphs[-1]["23"]["class_type"],
                             "BiRefNetRMBG")
        approval = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(approval.status_code, 200, approval.text)
        self.assertEqual(approval.json()["count"], 5)
        for item in approval.json()["assets"]:
            meta = item["generation_details"]
            self.assertEqual(meta["workflow_version"], "comfy-sprite-v3-matting")
            self.assertEqual(meta["quality"]["method"], "neural_birefnet")
            self.assertEqual(meta["matting"], {
                "mode": "neural_birefnet_portrait", "model": "BiRefNet-portrait"})

    def test_neural_combined_with_ipadapter_and_lora_publishes_v4(self):
        ref = self.client.post(
            f"/api/v1/stories/{self.story}/scene-image",
            files={"file": ("portrait.png", sprite_png(), "image/png")})
        self.assertEqual(ref.status_code, 200, ref.text)
        identity = self.client.get(
            f"/api/v1/stories/{self.story}/visual-state").json()["assets"][0]["id"]
        draft = self.draft(cutout_mode="neural_rmbg2",
                           reference_mode="ipadapter", use_lora=True,
                           reference_asset_id=identity)
        for expression in EXPRESSIONS:
            r = self.generate(draft, expression)
            self.assertEqual(r.status_code, 200, r.text)
        graph = self.mock.graphs[-1]
        self.assertEqual(graph["10"]["class_type"], "LoraLoader")
        self.assertEqual(graph["20"]["class_type"], "IPAdapterUnifiedLoader")
        self.assertEqual(graph["23"]["class_type"], "RMBG")
        self.assertEqual(graph["5"]["inputs"]["model"], ["22", 0])
        self.assertEqual(graph["7"]["inputs"]["images"], ["23", 0])
        approved = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(approved.status_code, 200, approved.text)
        meta = approved.json()["assets"][0]["generation_details"]
        self.assertEqual(meta["workflow_version"], "comfy-sprite-v4-matting-ipadapter")
        self.assertEqual(meta["matting"]["model"], "RMBG-2.0")
        self.assertEqual(meta["adapter"]["reference_kind"], "gallery")
        self.assertEqual(meta["lora"]["lora_name"], "aira.safetensors")

    def test_approval_failure_preserves_review_draft(self):
        draft = self.draft()
        for expression in EXPRESSIONS:
            self.assertEqual(self.generate(draft, expression).status_code, 200)
        with patch.object(self.app.state.creator_media, "import_expression_sheet",
                          side_effect=RuntimeError("DB failure")):
            with self.assertRaisesRegex(RuntimeError, "DB failure"):
                self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(self.client.get(self.url(
            f"/{draft['id']}")).json()["ready_count"], 5)
        self.assertEqual(len(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"]), 0)
        accepted = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(accepted.status_code, 200, accepted.text)

    def test_silhouette_drift_requires_separate_author_acknowledgement(self):
        draft = self.draft()
        for expression in EXPRESSIONS:
            self.mock.horizontal_offset = 48 if expression == "joy" else 0
            result = self.generate(draft, expression)
            self.assertEqual(result.status_code, 200, result.text)
        self.mock.horizontal_offset = 0
        state = self.client.get(self.url(f"/{draft['id']}")).json()
        self.assertEqual(state["ready_count"], 5)
        self.assertTrue(state["alignment_review_needed"])
        self.assertTrue(any("joy: posición" in warning
                            for warning in state["alignment_warnings"]))
        refused = self.client.post(self.url(f"/{draft['id']}/approve"))
        self.assertEqual(refused.status_code, 409, refused.text)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])
        approved = self.client.post(self.url(f"/{draft['id']}/approve"),
                                    json={"accept_alignment_warnings": True})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["count"], 5)

    def test_modified_preview_is_rejected_before_publishing(self):
        draft = self.draft()
        for expression in EXPRESSIONS:
            self.assertEqual(self.generate(draft, expression).status_code, 200)
        with self.app.state.store._conn() as db:
            row = db.execute("SELECT slots_json FROM sprite_drafts WHERE id=?",
                             (draft["id"],)).fetchone()
        slots = json.loads(row["slots_json"])
        path = self.app.state.sprite_drafts._file(
            self.story, draft["id"], "neutral", slots["neutral"]["file"])
        path.write_bytes(sprite_png())  # valid image, different content and alpha
        invalid = self.client.post(self.url(f"/{draft['id']}/approve"),
                                   json={"accept_alignment_warnings": True})
        self.assertEqual(invalid.status_code, 409, invalid.text)
        self.assertIn("cambió", invalid.text)
        self.assertEqual(self.client.get(self.url(
            f"/{draft['id']}")).json()["ready_count"], 5)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{self.story}/creator/assets").json()["assets"], [])

    def test_draft_limit_and_no_checkpoint_are_validated(self):
        for _ in range(3):
            self.draft()
        excess = self.client.post(
            f"/api/v1/stories/{self.story}/creator/characters/{self.npc}/sprite-drafts",
            json={"caption": "Aira dentro de un castillo"})
        self.assertEqual(excess.status_code, 422, excess.text)
        self.assertIn("Máximo tres", excess.text)
        self.assertEqual(len(self.client.get(self.url()).json()["drafts"]), 3)


if __name__ == "__main__":
    unittest.main()
