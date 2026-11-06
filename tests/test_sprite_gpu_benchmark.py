"""No-GPU contract tests for opt-in physical sprite benchmark and report."""
from __future__ import annotations

import asyncio
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from sprite_gpu_benchmark import (
    MODES, EXPRESSIONS, benchmark, comma_list, image_metrics,
    loopback_base, list_resources, nvidia_snapshot, quantile,
)


STORY = "00000000-0000-0000-0000-000000000001"
NPC = "00000000-0000-0000-0000-000000000002"


def png():
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((75, 22, 180, 227),
                                  fill=(219, 44, 150, 255))
    image.putpixel((80, 120), (219, 44, 150, 80))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


class FakeNoble:
    def __init__(self, missing_mode=False, fail_expression=None):
        self.missing_mode = missing_mode
        self.fail_expression = fail_expression
        self.requests = []
        self.creates = 0
        self.generates = []
        self.byte_image = png()

    def __call__(self, req: httpx.Request):
        route = req.url.path
        self.requests.append((req.method, route))
        if route == "/api/v1/stories" and req.method == "GET":
            return httpx.Response(200, json={"stories": [
                {"id": STORY, "title": "Libro privado"},
            ]})
        if route == f"/api/v1/stories/{STORY}/creator/characters":
            return httpx.Response(200, json={"characters": [
                {"id": NPC, "name": "Personaje de prueba"},
            ]})
        if (req.method == "DELETE" and route.startswith(
                f"/api/v1/stories/{STORY}/creator/sprite-drafts/")):
            return httpx.Response(204)
        if route == "/api/v1/images/config":
            return httpx.Response(200, json={
                "checkpoint": "SDXL-test.safetensors", "width": 256,
                "height": 256, "steps": 10, "cfg": 6.0})
        if route == "/api/v1/images/status":
            return httpx.Response(200, json={
                "online": True, "checkpoints": ["SDXL-test.safetensors"]})
        if route == "/api/v1/images/matting/status":
            return httpx.Response(200, json={"neural_available":
                not self.missing_mode,
                "modes": [
                    {"mode": "chroma_green", "ready": True, "reason": ""},
                    {"mode": "neural_rmbg2",
                     "ready": not self.missing_mode, "reason": "No files" if
                     self.missing_mode else ""},
                ]})
        if route == "/api/v1/images/identity-adapter/status":
            return httpx.Response(200, json={"available": True, "presets": [
                "PLUS FACE (portraits)"]})
        if (req.method == "POST" and
                route.endswith("/sprite-drafts") and
                "/characters/" in route):
            self.creates += 1
            body = json.loads(req.content)
            return httpx.Response(201, json={
                "id": f"00000000-0000-0000-0000-{self.creates:012d}",
                "cutout_mode": body["cutout_mode"]})
        if req.method == "POST" and "/expressions/" in route:
            name = route.split("/")[-1]
            self.generates.append(name)
            if name == self.fail_expression:
                return httpx.Response(422, json={"detail": "bad alpha"})
            return httpx.Response(200, json={"slots": {
                name: {"ready": True, "quality": {
                    "method": "border_chroma_key", "coverage": 0.2}}}})
        if req.method == "GET" and route.endswith("/preview"):
            return httpx.Response(200, content=self.byte_image,
                                  headers={"content-type": "image/png"})
        return httpx.Response(404)


def fake_gpu(index):
    return {"index": index, "name": "Simulated for unit tests",
            "total_mb": 16384, "used_mb": 3800,
            "utilization_percent": 40}


class BenchmarkScriptTests(unittest.TestCase):
    def test_url_scope_and_input_validation(self):
        self.assertEqual(loopback_base("http://127.0.0.1:8000/"),
                         "http://127.0.0.1:8000")
        self.assertEqual(loopback_base("http://[::1]:8000"),
                         "http://[::1]:8000")
        for url in ("https://127.0.0.1:8000",
                    "http://public.example:8000", "http://127.0.0.1:8000/api",
                    "http://u:p@localhost:8000", "http://localhost:8000?x=1",
                    "http://127.0.0.1:8000/path#hidden",
                    "http://localhost"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                loopback_base(url)
        self.assertEqual(comma_list("neutral,joy", EXPRESSIONS),
                         ("neutral", "joy"))
        for value in ("neutral,neutral", "neutral,unknown", ""):
            with self.assertRaises(ValueError):
                comma_list(value, EXPRESSIONS)
        self.assertEqual(quantile([12, 6, 18], .5), 12)
        self.assertIsNone(quantile([], .5))

    def test_metrics_preserve_measured_partial_alpha_without_face_claims(self):
        report = image_metrics(png())
        self.assertEqual((report["width"], report["height"]), (256, 256))
        self.assertGreater(report["soft_alpha_fraction"], 0)
        self.assertEqual(report["border_opaque_fraction"], 0)
        self.assertGreater(report["transparent_fraction"], 0.5)
        for bad in (b"", b"fake data", b"a" * (13 * 1024 * 1024)):
            with self.assertRaises(ValueError):
                image_metrics(bad)

    def test_benchmark_creates_only_unapproved_drafts_and_reproducible_files(self):
        fake = FakeNoble()
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            messages = []
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=("chroma_green", "neural_rmbg2"),
                expressions=("neutral", "joy"), seed=1407, directory=directory,
                transport=httpx.MockTransport(fake), gpu_probe=fake_gpu,
                progress=messages.append, monitor_period=.001))
            self.assertTrue(result["simulated"])
            self.assertEqual([m["status"] for m in result["modes"]],
                             ["success", "success"])
            self.assertEqual(fake.creates, 2)
            self.assertEqual(len(fake.generates), 4)
            self.assertTrue(all(m["latency_p50_ms"] is not None
                                for m in result["modes"]))
            self.assertGreaterEqual(result["modes"][0]["expressions"][0][
                "gpu"]["samples"], 1)
            self.assertEqual(result["modes"][0]["gpu_peak_used_mb"], 3800)
            self.assertEqual(result["modes"][0]["gpu_peak_util_percent"], 40)
            self.assertEqual(result["modes"][0]["gpu_device"],
                             "Simulated for unit tests")
            self.assertTrue((directory / "chroma_green-neutral.png").is_file())
            self.assertTrue((directory / "neural_rmbg2-joy.png").is_file())
            self.assertTrue((directory / "report.json").is_file())
            self.assertTrue((directory / "review.csv").is_file())
            page = (directory / "review.html").read_text(encoding="utf-8")
            self.assertIn("chroma_green-neutral.png", page)
            self.assertIn("neural_rmbg2-joy.png", page)
            saved = (directory / "report.json").read_text(encoding="utf-8")
            self.assertNotIn(STORY, saved)
            self.assertNotIn(NPC, saved)
            self.assertNotIn("Benchmark técnico de sprites", saved)
            self.assertFalse(any("/approve" in path for _, path in fake.requests))
            self.assertFalse(any(method == "DELETE" for method, _ in fake.requests))
            self.assertTrue(any("GENERANDO" in line for line in messages))

    def test_check_only_does_not_touch_story_or_launch_gpu(self):
        fake = FakeNoble()
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=("chroma_green",),
                expressions=("neutral",), seed=3, directory=Path(out),
                check_only=True, transport=httpx.MockTransport(fake),
                gpu_probe=lambda i: self.fail("GPU probe must not run"),
                progress=lambda _: None))
            self.assertEqual(result["modes"], [])
            self.assertTrue(result["preflight"]["all_requested_ready"])
            self.assertEqual(fake.creates, 0)
            self.assertEqual(len(fake.requests), 3)
            self.assertTrue((Path(out) / "report.json").exists())
            self.assertFalse((Path(out) / "review.html").exists())

    def test_check_only_produces_machine_readable_missing_model_diagnostics(self):
        fake = FakeNoble(missing_mode=True)
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=("chroma_green", "neural_rmbg2"),
                expressions=("neutral",), seed=4, directory=Path(out),
                check_only=True, transport=httpx.MockTransport(fake),
                gpu_probe=lambda i: self.fail("No GPU call in check-only"),
                progress=lambda _: None))
            self.assertFalse(result["preflight"]["all_requested_ready"])
            self.assertEqual(result["preflight"]["requested_modes_ready"], {
                "chroma_green": True, "neural_rmbg2": False})
            self.assertEqual(fake.creates, 0)
            self.assertFalse((Path(out) / "review.html").exists())

    def test_missing_model_skips_without_creating_draft(self):
        fake = FakeNoble(missing_mode=True)
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=("neural_rmbg2",),
                expressions=("neutral",), seed=8, directory=Path(out),
                transport=httpx.MockTransport(fake), gpu_probe=lambda i: None,
                progress=lambda _: None))
            self.assertEqual(result["modes"][0]["status"], "skipped")
            self.assertEqual(fake.creates, 0)
            self.assertEqual(fake.generates, [])
            self.assertFalse((Path(out) / "neural_rmbg2-neutral.png").exists())

    def test_failed_second_expression_keeps_first_preview_and_report(self):
        fake = FakeNoble(fail_expression="joy")
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=("chroma_green",),
                expressions=("neutral", "joy", "anger"), seed=7,
                directory=Path(out), transport=httpx.MockTransport(fake),
                gpu_probe=lambda i: None, progress=lambda _: None))
            self.assertEqual(result["modes"][0]["status"], "partial")
            self.assertEqual(fake.generates, ["neutral", "joy"])
            self.assertEqual(result["modes"][0]["expressions"][1]["error"], "HTTP 422")
            self.assertEqual(result["modes"][0]["expressions"][1][
                "gpu"]["samples"], 0)
            self.assertTrue((Path(out) / "chroma_green-neutral.png").is_file())
            self.assertEqual(json.loads((Path(out) / "report.json").read_text())[
                "modes"][0]["status"], "partial")

    def test_discovery_is_local_read_only_and_keeps_private_data_out_of_reports(self):
        fake = FakeNoble()
        transport = httpx.MockTransport(fake)
        stories = asyncio.run(list_resources("http://127.0.0.1:8000",
                                             transport=transport))
        cast = asyncio.run(list_resources(
            "http://127.0.0.1:8000", STORY, transport=transport))
        self.assertEqual(stories, [{"id": STORY, "label": "Libro privado"}])
        self.assertEqual(cast, [{"id": NPC, "label": "Personaje de prueba"}])
        self.assertEqual(len(fake.requests), 2)
        self.assertTrue(all(method == "GET" for method, _ in fake.requests))

    def test_discards_own_temporary_drafts_for_all_four_modes(self):
        fake = FakeNoble()
        # The mocked provider only advertises two modes; the other two skip
        # safely rather than claiming the four-model comparison completed.
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://127.0.0.1:8000", story_id=STORY,
                character_id=NPC, modes=MODES,
                expressions=("neutral",), seed=3, directory=Path(out),
                discard_after=True, transport=httpx.MockTransport(fake),
                gpu_probe=lambda _: None, progress=lambda _: None))
            self.assertEqual([r["status"] for r in result["modes"]],
                             ["success", "success", "skipped", "skipped"])
            self.assertEqual([r["draft_cleanup"] for r in result["modes"][:2]],
                             ["discarded", "discarded"])
            deleted = [p for method, p in fake.requests if method == "DELETE"]
            self.assertEqual(len(deleted), 2)
            self.assertTrue((Path(out) / "chroma_green-neutral.png").is_file())
            self.assertTrue((Path(out) / "neural_rmbg2-neutral.png").is_file())
            with self.assertRaisesRegex(ValueError, "tres borradores"):
                asyncio.run(benchmark(
                    base="http://127.0.0.1:8000", story_id=STORY,
                    character_id=NPC, modes=MODES,
                    expressions=("neutral",), seed=3, directory=Path(out),
                    discard_after=False, transport=httpx.MockTransport(fake)))

    def test_declared_ipadapter_is_preflighted_without_exposing_reference(self):
        fake = FakeNoble()
        with tempfile.TemporaryDirectory() as out:
            result = asyncio.run(benchmark(
                base="http://localhost:8000", story_id=STORY,
                character_id=NPC, modes=("chroma_green",),
                expressions=("neutral",), seed=7, directory=Path(out),
                reference_asset_id=STORY, reference_mode="ipadapter",
                transport=httpx.MockTransport(fake), gpu_probe=lambda _: None,
                progress=lambda _: None))
            self.assertTrue(result["preflight"]["ipadapter"]["available"])
            self.assertEqual(result["modes"][0]["status"], "success")
            self.assertNotIn(STORY, json.dumps(result))

    def test_nvidia_snapshot_uses_host_driver_and_no_fabricated_values(self):
        class Proc:
            returncode = 0
            stdout = "0, Test GPU, 16384, 2700, 43\n1, GPU2, 8192, 1200, 12\n"
        with patch("shutil.which", return_value="/usr/bin/nvidia-smi"), patch(
                "subprocess.run", return_value=Proc()):
            row = nvidia_snapshot(0)
        self.assertEqual(row["used_mb"], 2700)
        self.assertEqual(row["total_mb"], 16384)
        with patch("shutil.which", return_value=None):
            self.assertIsNone(nvidia_snapshot(0))


if __name__ == "__main__":
    unittest.main()
