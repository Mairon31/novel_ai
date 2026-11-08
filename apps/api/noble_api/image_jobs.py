"""Durable, opt-in image render jobs for the local single-process Noble API.

Only a POST from the creator queues work. Reads, recovery and app startup never
invoke ComfyUI. Jobs interrupted by a restart remain visible for explicit retry.
A stored seed makes retries eligible for the existing image cache.
"""
from __future__ import annotations

import asyncio
import json
import secrets
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from .images import SceneIllustration, SceneImageService


class ImageJobCreate(SceneIllustration):
    model_config = ConfigDict(extra="forbid")
    request_id: uuid.UUID


class ImageGenerationJobs:
    def __init__(self, images: SceneImageService):
        self.images = images
        self.store = images.narrative.store
        self._queue_lock = asyncio.Lock()
        self._tasks: dict[str, asyncio.Task] = {}
        self._shutting_down = False
        with self.store._conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS image_generation_jobs (
                    id TEXT PRIMARY KEY,
                    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
                    request_id TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    effective_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    result_json TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    UNIQUE(story_id, request_id)
                );
                CREATE INDEX IF NOT EXISTS image_jobs_by_story
                    ON image_generation_jobs(story_id, created_at DESC);
            """)
            # An old task is not automatically replayed: a remote renderer may
            # have completed even if the local process did not save a result.
            db.execute("""UPDATE image_generation_jobs
                SET status='interrupted',
                    error='Generation interrupted by application restart. Retry explicitly.',
                    updated_at=?
                WHERE status IN ('queued','running')""", (time.time(),))

    def _require_story(self, story_id: str) -> None:
        if self.images.narrative.get_story(story_id) is None:
            raise HTTPException(404, "Story not found")

    @staticmethod
    def _public(row) -> dict:
        job = dict(row)
        job["seed"] = json.loads(job.pop("effective_json"))["seed"]
        job.pop("input_json")
        job["result"] = json.loads(job.pop("result_json")) if job["result_json"] else None
        return job

    def get(self, story_id: str, job_id: str) -> dict:
        self._require_story(story_id)
        with self.store._conn() as db:
            row = db.execute(
                "SELECT * FROM image_generation_jobs WHERE id=? AND story_id=?",
                (job_id, story_id)).fetchone()
        if row is None:
            raise HTTPException(404, "Image job not found in this story")
        return self._public(row)

    def list(self, story_id: str) -> dict:
        self._require_story(story_id)
        with self.store._conn() as db:
            rows = db.execute(
                "SELECT * FROM image_generation_jobs WHERE story_id=? "
                "ORDER BY created_at DESC,id DESC LIMIT 25", (story_id,)
            ).fetchall()
        return {"jobs": [self._public(row) for row in rows]}

    def _schedule(self, job_id: str) -> None:
        if self._shutting_down:
            raise HTTPException(503, "Image job service is shutting down")
        task = asyncio.create_task(self._run(job_id))
        self._tasks[job_id] = task
        task.add_done_callback(lambda _task: self._tasks.pop(job_id, None)
                               if self._tasks.get(job_id) is _task else None)

    async def submit(self, story_id: str, body: ImageJobCreate) -> dict:
        self._require_story(story_id)
        if self._shutting_down:
            raise HTTPException(503, "Image job service is shutting down")
        request_id = str(body.request_id)
        payload = body.model_dump(mode="json", exclude={"request_id"})
        submitted = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        now = time.time()
        job_id = str(uuid.uuid4())
        scheduled = False
        with self.store._conn() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT id,input_json FROM image_generation_jobs "
                "WHERE story_id=? AND request_id=?", (story_id, request_id)
            ).fetchone()
            if existing:
                if existing["input_json"] != submitted:
                    raise HTTPException(409, "Request ID already used for different image parameters")
                job_id = existing["id"]
            else:
                # Bounded local queue: a tab or script must not accumulate
                # unlimited parked asyncio tasks and GPU work.
                active_count = db.execute(
                    "SELECT COUNT(*) FROM image_generation_jobs "
                    "WHERE status IN ('queued','running')"
                ).fetchone()[0]
                if active_count >= 8:
                    raise HTTPException(429, "Image generation queue is full (8 jobs)")
                payload["seed"] = (payload["seed"] if payload["seed"] is not None
                                   else secrets.randbelow(2 ** 53))
                db.execute(
                    "INSERT INTO image_generation_jobs "
                    "(id,story_id,request_id,input_json,effective_json,status,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,'queued',?,?)",
                    (job_id, story_id, request_id, submitted,
                     json.dumps(payload, sort_keys=True, ensure_ascii=False),
                     now, now))
                scheduled = True
        if scheduled:
            self._schedule(job_id)
        return self.get(story_id, job_id)

    async def _run(self, job_id: str) -> None:
        # Serialize within the process instead of racing SceneImageService's
        # global GPU lock and producing spurious HTTP 409 errors.
        try:
            async with self._queue_lock:
                with self.store._conn() as db:
                    db.execute("BEGIN IMMEDIATE")
                    row = db.execute(
                        "SELECT story_id,effective_json,status FROM image_generation_jobs "
                        "WHERE id=?", (job_id,)).fetchone()
                    if not row or row["status"] != "queued":
                        return
                    db.execute(
                        "UPDATE image_generation_jobs SET status='running',attempts=attempts+1,"
                        "error=NULL,updated_at=? WHERE id=?", (time.time(), job_id))
                    story_id = row["story_id"]
                    effective = row["effective_json"]
                try:
                    result = await self.images.illustrate(
                        story_id, SceneIllustration.model_validate_json(effective))
                    status, error = "succeeded", None
                except HTTPException as exc:
                    result = None
                    status = "failed"
                    error = f"HTTP {exc.status_code}: {exc.detail}"[:360]
                except Exception:
                    result = None
                    status = "failed"
                    error = "Unexpected image generation error"
                with self.store._conn() as db:
                    db.execute("UPDATE image_generation_jobs SET status=?,error=?,"
                               "result_json=?,updated_at=? WHERE id=? AND status='running'",
                               (status, error, json.dumps(result, ensure_ascii=False)
                                if result is not None else None, time.time(), job_id))
        except asyncio.CancelledError:
            with self.store._conn() as db:
                db.execute("UPDATE image_generation_jobs "
                           "SET status='interrupted',"
                           "error='Generation interrupted; retry explicitly.',updated_at=? "
                           "WHERE id=? AND status IN ('running','queued')",
                           (time.time(), job_id))
            raise

    async def cancel(self, story_id: str, job_id: str) -> dict:
        self.get(story_id, job_id)
        with self.store._conn() as db:
            result = db.execute(
                "UPDATE image_generation_jobs SET status='cancelled',"
                "error='Local image job cancelled. Remote ComfyUI execution may continue.',"
                "updated_at=? WHERE story_id=? AND id=? AND status IN ('queued','running')",
                (time.time(), story_id, job_id))
            if not result.rowcount:
                raise HTTPException(409, "Only queued or running jobs can be cancelled")
        task = self._tasks.get(job_id)
        if task:
            task.cancel()
        return self.get(story_id, job_id)

    async def retry(self, story_id: str, job_id: str) -> dict:
        self.get(story_id, job_id)
        if self._shutting_down:
            raise HTTPException(503, "Image job service is shutting down")
        # Wait for an old cancelled task to release the local rendering lock
        # before scheduling a new task for the same persisted job ID.
        previous = self._tasks.get(job_id)
        if previous:
            try:
                await previous
            except asyncio.CancelledError:
                pass
        with self.store._conn() as db:
            result = db.execute(
                "UPDATE image_generation_jobs SET status='queued',error=NULL,"
                "result_json=NULL,updated_at=? "
                "WHERE story_id=? AND id=? AND status IN ('failed','cancelled','interrupted')",
                (time.time(), story_id, job_id))
            if not result.rowcount:
                raise HTTPException(409, "Only failed, cancelled or interrupted jobs can be retried")
        self._schedule(job_id)
        return self.get(story_id, job_id)

    async def shutdown(self) -> None:
        self._shutting_down = True
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with self.store._conn() as db:
            db.execute(
                "UPDATE image_generation_jobs SET status='interrupted',"
                "error='Generation interrupted by application shutdown.',updated_at=? "
                "WHERE status IN ('queued','running')", (time.time(),))


def mount_image_job_routes(app, jobs: ImageGenerationJobs) -> None:
    @app.post("/api/v1/stories/{story_id}/image-jobs", status_code=202)
    async def submit_image_job(story_id: uuid.UUID, body: ImageJobCreate):
        return await jobs.submit(str(story_id), body)

    @app.get("/api/v1/stories/{story_id}/image-jobs")
    def list_image_jobs(story_id: uuid.UUID):
        return jobs.list(str(story_id))

    @app.get("/api/v1/stories/{story_id}/image-jobs/{job_id}")
    def read_image_job(story_id: uuid.UUID, job_id: uuid.UUID):
        return jobs.get(str(story_id), str(job_id))

    @app.post("/api/v1/stories/{story_id}/image-jobs/{job_id}/cancel")
    async def cancel_image_job(story_id: uuid.UUID, job_id: uuid.UUID):
        return await jobs.cancel(str(story_id), str(job_id))

    @app.post("/api/v1/stories/{story_id}/image-jobs/{job_id}/retry", status_code=202)
    async def retry_image_job(story_id: uuid.UUID, job_id: uuid.UUID):
        return await jobs.retry(str(story_id), str(job_id))
