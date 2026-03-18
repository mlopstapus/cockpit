"""Redis-backed job state store. Single interface to all job data."""
import json
import logging
import uuid
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

from models import Job, JobStage, JobStatus, JobSummary

logger = logging.getLogger(__name__)

LOG_BUFFER_SIZE = 1000  # Lines retained per job
RECENT_JOBS_LIMIT = 50


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _job_key(job_id: str) -> str:
    return f"job:{job_id}"


def _log_key(job_id: str) -> str:
    return f"job:{job_id}:logs"


def _seen_key(job_id: str) -> str:
    return f"job:{job_id}:seen_comments"


def _pr_key(github_repo: str, pr_number: int) -> str:
    return f"pr:{github_repo}:{pr_number}"


class JobStore:
    """All Redis access goes through this class."""

    def __init__(self, redis_url: str):
        self._redis: aioredis.Redis = aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        )

    async def close(self):
        await self._redis.aclose()

    # ── Enqueue ────────────────────────────────────────────────────────────────

    async def enqueue(self, job: Job) -> str:
        """Add a job to the queue. Deduplicates by PR."""
        pr_key = _pr_key(job.github_repo, job.pr_number)

        # Dedup: if a job already exists for this PR, skip
        existing_id = await self._redis.get(pr_key)
        if existing_id:
            logger.debug(f"PR {job.github_repo}#{job.pr_number} already queued as {existing_id}")
            return existing_id

        # Persist job hash
        await self._redis.hset(_job_key(job.id), mapping=self._serialize(job))

        # Record PR → job mapping
        await self._redis.set(pr_key, job.id)

        # Push to work queue
        await self._redis.rpush("jobs:queue", job.id)

        # Track in history sorted set (score = creation timestamp)
        await self._redis.zadd(
            "jobs:history",
            {job.id: job.created_at.timestamp()},
        )

        logger.info(f"Enqueued job {job.id} for {job.github_repo}#{job.pr_number}")
        return job.id

    # ── Dequeue ────────────────────────────────────────────────────────────────

    async def dequeue(self, timeout: int = 5) -> Job | None:
        """Block-pop the next job. Returns None on timeout."""
        result = await self._redis.blpop("jobs:queue", timeout=timeout)
        if not result:
            return None
        _, job_id = result
        return await self.get(job_id)

    # ── Read / Write ───────────────────────────────────────────────────────────

    async def get(self, job_id: str) -> Job | None:
        data = await self._redis.hgetall(_job_key(job_id))
        if not data:
            return None
        return self._deserialize(data)

    async def update(self, job_id: str, **fields) -> None:
        """Patch one or more fields on a job."""
        if not fields:
            return
        fields["updated_at"] = _now_iso()
        serialized = {k: self._val(v) for k, v in fields.items()}
        await self._redis.hset(_job_key(job_id), mapping=serialized)

    async def mark_active(self, job_id: str) -> None:
        await self._redis.sadd("jobs:active", job_id)
        await self.update(job_id, status=JobStatus.RUNNING)

    async def mark_complete(self, job_id: str) -> None:
        await self._redis.srem("jobs:active", job_id)
        await self.update(
            job_id,
            status=JobStatus.COMPLETED,
            stage=JobStage.DONE,
            completed_at=_now_iso(),
        )

    async def mark_failed(self, job_id: str, reason: str) -> None:
        await self._redis.srem("jobs:active", job_id)
        await self.update(
            job_id,
            status=JobStatus.FAILED,
            stage=JobStage.FAILED,
            error=reason,
            completed_at=_now_iso(),
        )

    async def mark_cancelled(self, job_id: str) -> None:
        await self._redis.srem("jobs:active", job_id)
        await self.update(job_id, status=JobStatus.CANCELLED, completed_at=_now_iso())

    # ── Logs ───────────────────────────────────────────────────────────────────

    async def append_log(self, job_id: str, line: str) -> None:
        pipe = self._redis.pipeline()
        pipe.rpush(_log_key(job_id), line)
        pipe.ltrim(_log_key(job_id), -LOG_BUFFER_SIZE, -1)
        await pipe.execute()

    async def get_log_tail(self, job_id: str, n: int = 200) -> list[str]:
        return await self._redis.lrange(_log_key(job_id), -n, -1)

    # ── Comment dedup ──────────────────────────────────────────────────────────

    async def is_comment_seen(self, job_id: str, comment_id: int) -> bool:
        return await self._redis.sismember(_seen_key(job_id), str(comment_id))

    async def mark_comment_seen(self, job_id: str, comment_id: int) -> None:
        await self._redis.sadd(_seen_key(job_id), str(comment_id))

    # ── List ───────────────────────────────────────────────────────────────────

    async def list_active(self) -> list[Job]:
        job_ids = await self._redis.smembers("jobs:active")
        jobs = []
        for jid in job_ids:
            j = await self.get(jid)
            if j:
                jobs.append(j)
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)

    async def list_recent(self, limit: int = RECENT_JOBS_LIMIT) -> list[Job]:
        job_ids = await self._redis.zrevrange("jobs:history", 0, limit - 1)
        jobs = []
        for jid in job_ids:
            j = await self.get(jid)
            if j:
                jobs.append(j)
        return jobs

    # ── Serialization helpers ──────────────────────────────────────────────────

    @staticmethod
    def _val(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, (JobStage, JobStatus)):
            return v.value
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    def _serialize(self, job: Job) -> dict[str, str]:
        return {
            "id": job.id,
            "repo_path": job.repo_path,
            "github_repo": job.github_repo,
            "pr_number": str(job.pr_number),
            "pr_title": job.pr_title,
            "pr_body": job.pr_body,
            "spec_name": job.spec_name,
            "branch": job.branch,
            "stage": job.stage.value,
            "status": job.status.value,
            "account_id": job.account_id,
            "pr_comment_id": str(job.pr_comment_id) if job.pr_comment_id else "",
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
            "completed_at": job.completed_at.isoformat() if job.completed_at else "",
            "pr_url": job.pr_url or "",
            "error": job.error or "",
        }

    @staticmethod
    def _deserialize(data: dict) -> Job:
        def _dt(s: str) -> datetime | None:
            return datetime.fromisoformat(s) if s else None

        return Job(
            id=data["id"],
            repo_path=data["repo_path"],
            github_repo=data["github_repo"],
            pr_number=int(data["pr_number"]),
            pr_title=data["pr_title"],
            pr_body=data["pr_body"],
            spec_name=data["spec_name"],
            branch=data["branch"],
            stage=JobStage(data["stage"]),
            status=JobStatus(data["status"]),
            account_id=data["account_id"],
            pr_comment_id=int(data["pr_comment_id"]) if data.get("pr_comment_id") else None,
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            completed_at=_dt(data.get("completed_at", "")),
            pr_url=data.get("pr_url") or None,
            error=data.get("error") or None,
        )

    # ── Factory ────────────────────────────────────────────────────────────────

    @staticmethod
    def make_job(
        github_repo: str,
        pr_number: int,
        pr_title: str,
        pr_body: str,
        branch: str,
        repo_path: str,
        account_id: str = "primary",
    ) -> Job:
        cockpit_prefix = "[COCKPIT] "
        spec_name = pr_title[len(cockpit_prefix):].strip() if pr_title.startswith(cockpit_prefix) else pr_title
        now = datetime.utcnow()
        return Job(
            id=str(uuid.uuid4())[:8],
            repo_path=repo_path,
            github_repo=github_repo,
            pr_number=pr_number,
            pr_title=pr_title,
            pr_body=pr_body,
            spec_name=spec_name,
            branch=branch,
            stage=JobStage.IDLE,
            status=JobStatus.QUEUED,
            account_id=account_id,
            created_at=now,
            updated_at=now,
        )
