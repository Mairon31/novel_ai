"""Durable local image jobs: request idempotence, recovery and cancellation.

No GPU, ComfyUI server, real model or external network connection is required.
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class ImageJobsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(self.root)
        self.cm = TestClient(self.app)
        self.client = self.cm.__enter__()
        created = self.client.post("/api/v1/stories", json={
            "title": "The harbor lighthouse",
            "premise": "An old coastal town has a protected lighthouse.",
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.story = created.json()["id"]
        self.url = f"/api/v1/stories/{self.story}/image-jobs"

    def tearDown(self):
        self.cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def start(self, request_id=None, prompt="An abandoned lighthouse at sunrise."):
        return self.client.post(self.url, json={
            "request_id": request_id or str(uuid.uuid4()), "prompt": prompt,
        })

    def wait_for(self, ident, status, timeout=2.5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = self.client.get(self.url + "/" + ident)
            self.assertEqual(job.status_code, 200, job.text)
            if job.json()["status"] == status:
                return job.json()
            time.sleep(0.025)
        self.fail(f"Job {ident} did not reach {status}, current {job.text}")

    def test_duplicate_request_reuses_job_and_saved_seed(self):
        requested = []
        async def render(_story, body):
            requested.append(body.seed)
            return {"asset_id": str(uuid.uuid4()), "seed": body.seed,
                    "story": self.app.state.narrative.get_story(self.story)}
        self.app.state.images.illustrate = AsyncMock(side_effect=render)
        key = str(uuid.uuid4())
        first = self.start(request_id=key)
        self.assertEqual(first.status_code, 202, first.text)
        job = first.json()
        duplicate = self.start(request_id=key)
        self.assertEqual(duplicate.status_code, 202, duplicate.text)
        self.assertEqual(duplicate.json()["id"], job["id"])
        finished = self.wait_for(job["id"], "succeeded")
        self.assertEqual(finished["attempts"], 1)
        self.assertEqual(len(requested), 1)
        self.assertEqual(requested, [finished["seed"]])
        self.assertIsNotNone(finished["result"]["asset_id"])
        self.assertEqual(self.client.get(self.url).json()["jobs"][0]["id"], job["id"])
        conflict = self.start(request_id=key, prompt="An entirely different coastal scene.")
        self.assertEqual(conflict.status_code, 409)

    def test_failure_retained_for_explicit_retry_without_regenerating_seed(self):
        seeds = []
        async def render(_story, body):
            seeds.append(body.seed)
            if len(seeds) == 1:
                raise HTTPException(422, "Select a ComfyUI checkpoint in Image Settings")
            return {"asset_id": str(uuid.uuid4()), "seed": body.seed}
        self.app.state.images.illustrate = AsyncMock(side_effect=render)
        started = self.start()
        job = self.wait_for(started.json()["id"], "failed")
        self.assertIn("HTTP 422", job["error"])
        self.assertEqual(job["attempts"], 1)
        retried = self.client.post(self.url + "/" + job["id"] + "/retry")
        self.assertEqual(retried.status_code, 202, retried.text)
        finished = self.wait_for(job["id"], "succeeded")
        self.assertEqual(finished["attempts"], 2)
        self.assertEqual(seeds, [job["seed"], job["seed"]])
        self.assertEqual(self.client.post(
            self.url + "/" + job["id"] + "/retry").status_code, 409)

    def test_running_job_cancel_does_not_claim_remote_renderer_stopped(self):
        async def blocked(_story, _request):
            await asyncio.sleep(20)
        self.app.state.images.illustrate = AsyncMock(side_effect=blocked)
        started = self.start()
        self.wait_for(started.json()["id"], "running")
        cancelled = self.client.post(self.url + "/" + started.json()["id"] + "/cancel")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertIn("Remote ComfyUI execution may continue", cancelled.json()["error"])
        time.sleep(0.03)
        self.assertEqual(self.client.get(
            self.url + "/" + started.json()["id"]).json()["status"], "cancelled")
        self.assertEqual(self.client.post(
            self.url + "/" + started.json()["id"] + "/cancel").status_code, 409)

    def test_recovery_marks_orphaned_job_interrupted_without_automatic_render(self):
        async def render(_story, body):
            return {"asset_id": str(uuid.uuid4()), "seed": body.seed}
        self.app.state.images.illustrate = AsyncMock(side_effect=render)
        started = self.start()
        finished = self.wait_for(started.json()["id"], "succeeded")
        with self.app.state.store._conn() as db:
            db.execute("UPDATE image_generation_jobs SET status='running',"
                       "result_json=NULL WHERE id=?", (finished["id"],))
        recovered_app = create_app(self.root)
        recovered_app.state.images.illustrate = AsyncMock(side_effect=render)
        with TestClient(recovered_app) as restarted:
            recovered = restarted.get(self.url + "/" + finished["id"])
            self.assertEqual(recovered.status_code, 200, recovered.text)
            self.assertEqual(recovered.json()["status"], "interrupted")
            self.assertEqual(recovered_app.state.images.illustrate.await_count, 0)
            retry = restarted.post(self.url + "/" + finished["id"] + "/retry")
            self.assertEqual(retry.status_code, 202, retry.text)
            deadline = time.monotonic() + 2.5
            while time.monotonic() < deadline:
                if restarted.get(self.url + "/" + finished["id"]).json()["status"] == "succeeded":
                    break
                time.sleep(0.025)
            self.assertEqual(restarted.get(self.url + "/" + finished["id"]).json()["status"],
                             "succeeded")
            self.assertEqual(restarted.get(self.url + "/" + finished["id"]).json()["seed"],
                             finished["seed"])

    def test_active_queue_has_a_bounded_capacity(self):
        # Simulate eight already queued UUID-scoped requests without starting
        # ComfyUI. An unrelated new ID cannot create a ninth active task.
        with self.app.state.store._conn() as db:
            for index in range(8):
                seed = index + 1
                db.execute(
                    "INSERT INTO image_generation_jobs "
                    "(id,story_id,request_id,input_json,effective_json,"
                    "status,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,'queued',?,?)",
                    (str(uuid.uuid4()), self.story, str(uuid.uuid4()),
                     '{"prompt":"Queue placeholder"}',
                     '{"prompt":"Queue placeholder","seed":%d}' % seed,
                     time.time(), time.time()))
        response = self.start()
        self.assertEqual(response.status_code, 429, response.text)
        self.assertIn("queue is full", response.json()["detail"])
        with self.app.state.store._conn() as db:
            db.execute(
                "UPDATE image_generation_jobs SET status='cancelled' "
                "WHERE id=(SELECT id FROM image_generation_jobs LIMIT 1)")
        async def render(_story, body):
            return {"asset_id": str(uuid.uuid4()), "seed": body.seed}
        self.app.state.images.illustrate = AsyncMock(side_effect=render)
        accepted = self.start()
        self.assertEqual(accepted.status_code, 202, accepted.text)
        self.wait_for(accepted.json()["id"], "succeeded")

    def test_story_scoping_and_request_validation(self):
        other = self.client.post("/api/v1/stories", json={
            "title": "The other island",
            "premise": "An unrelated island far across the ocean.",
        }).json()["id"]
        invalid = self.client.post(self.url, json={
            "request_id": str(uuid.uuid4()), "prompt": "short"})
        self.assertEqual(invalid.status_code, 422)
        missing = self.client.post(f"/api/v1/stories/{uuid.uuid4()}/image-jobs", json={
            "request_id": str(uuid.uuid4()), "prompt": "A valid but unrelated image prompt"})
        self.assertEqual(missing.status_code, 404)
        async def render(_story, body):
            return {"asset_id": str(uuid.uuid4()), "seed": body.seed}
        self.app.state.images.illustrate = AsyncMock(side_effect=render)
        created = self.start().json()
        for suffix in ("", "/cancel", "/retry"):
            path = f"/api/v1/stories/{other}/image-jobs/{created['id']}{suffix}"
            response = self.client.get(path) if not suffix else self.client.post(path)
            self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(self.client.get(
            f"/api/v1/stories/{other}/image-jobs").json()["jobs"], [])


if __name__ == "__main__":
    unittest.main()
