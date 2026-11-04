"""Offline contract tests for Colab notebook and benchmark; no GPU is claimed."""
import ast
import asyncio
import json
import sys
import unittest
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from worker_benchmark import benchmark, percentile, safe_base  # noqa: E402

TOKEN = "local-secret-for-unit-tests-123456789"


def fake_worker(request: httpx.Request) -> httpx.Response:
    if request.headers.get("authorization") != "Bearer " + TOKEN:
        return httpx.Response(401, json={"detail": "unauthorized"})
    if request.url.path == "/v1/models":
        return httpx.Response(200, json={"data": [{"id": "test-gguf"}]})
    if request.url.path == "/v1/health":
        return httpx.Response(200, json={
            "protocol": "noble-worker-v1", "engine_status": "ready",
            "gpu": [{"index": 0, "name": "Simulated GPU",
                     "vram_total_mb": 16000, "vram_used_mb": 3000,
                     "utilization_percent": 20}],
        })
    if request.url.path == "/v1/chat/completions":
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"},
            text='data: {"choices":[{"delta":{"content":"Una biblioteca."}}]}\n\n'
                 'data: {"choices":[],"usage":{"completion_tokens":5}}\n\n'
                 'data: [DONE]\n\n')
    return httpx.Response(404)


def failing_worker(request: httpx.Request) -> httpx.Response:
    if request.headers.get("authorization") != "Bearer " + TOKEN:
        return httpx.Response(401)
    if request.url.path == "/v1/models":
        return httpx.Response(200, json={"data": [{"id": "test-gguf"}]})
    if request.url.path == "/v1/chat/completions":
        return httpx.Response(503)
    return httpx.Response(404)


class WorkerBenchmarkTests(unittest.TestCase):
    def test_percentile_and_url_boundaries(self):
        self.assertEqual(percentile([100, 400, 200], 0.5), 200)
        self.assertEqual(safe_base("http://127.0.0.1:8765/"),
                         "http://127.0.0.1:8765")
        for url in ["http://public.example.com", "https://user:pass@demo.example",
                    "https://demo.example/private", "https://demo.example#token"]:
            with self.assertRaises(ValueError):
                safe_base(url)

    def test_benchmark_real_parser_with_mock_transport(self):
        report = asyncio.run(benchmark(
            "https://worker.trycloudflare.com", TOKEN, 2, 30,
            monitor_interval=.01, transport=httpx.MockTransport(fake_worker)))
        self.assertEqual(report["runs_succeeded"], 2, report)
        self.assertEqual(report["runs_failed"], 0)
        self.assertEqual(report["model"], "test-gguf")
        self.assertIsNotNone(report["ttft_p50_ms"])
        self.assertEqual(report["runs"][0]["completion_tokens_reported"], 5)
        self.assertEqual(report["runs"][0]["output_characters"], len("Una biblioteca."))
        self.assertNotIn(TOKEN, json.dumps(report))
        self.assertNotIn("Una biblioteca", json.dumps(report))

    def test_failed_model_does_not_claim_success(self):
        report = asyncio.run(benchmark(
            "https://worker.trycloudflare.com", TOKEN, 1, 30,
            monitor_interval=.01, transport=httpx.MockTransport(failing_worker)))
        self.assertEqual(report["runs_succeeded"], 0)
        self.assertEqual(report["runs_failed"], 1)
        self.assertIsNone(report["ttft_p50_ms"])

    def test_colab_notebook_is_valid_python(self):
        path = ROOT / "notebooks" / "noble_worker_colab_gpu.ipynb"
        notebook = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(notebook["nbformat"], 4)
        self.assertEqual(notebook["metadata"]["accelerator"], "GPU")
        py_cells = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
        self.assertGreaterEqual(len(py_cells), 6)
        for index, cell in enumerate(py_cells, 1):
            ast.parse("".join(cell["source"]), filename=f"colab-cell-{index}")
        all_code = "\n".join("".join(cell["source"]) for cell in py_cells)
        self.assertIn("NOBLE_WORKER_TOKEN", all_code)
        self.assertIn("noble_api.worker_server:app", all_code)
        self.assertIn("cloudflared", all_code)
        self.assertIn("worker_benchmark.py", all_code)
        self.assertIn("127.0.0.1:8765", all_code)


if __name__ == "__main__":
    unittest.main()
