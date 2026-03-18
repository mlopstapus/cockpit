"""Redis-backed job state store. Single interface to all job data."""
import json
import logging
import uuid
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

from models import ActivePR, Job, JobStage, JobStatus, JobSummary, PRReviewJob

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


def _issue_key(github_repo: str, issue_number: int) -> str:
    return f"issue:{github_repo}:{issue_number}"


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
        """Add a job to the queue. Deduplicates by issue."""
        issue_key = _issue_key(job.github_repo, job.issue_number)

        # Dedup: if a job already exists for this issue, skip
        existing_id = await self._redis.get(issue_key)
        if existing_id:
            logger.debug(f"Issue {job.github_repo}#{job.issue_number} already queued as {existing_id}")
            return existing_id

        # Persist job hash
        await self._redis.hset(_job_key(job.id), mapping=self._serialize(job))

        # Record issue → job mapping
        await self._redis.set(issue_key, job.id)

        # Push to work queue
        await self._redis.rpush("jobs:queue", job.id)

        # Track in history sorted set (score = creation timestamp)
        await self._redis.zadd(
            "jobs:history",
            {job.id: job.created_at.timestamp()},
        )

        logger.info(f"Enqueued job {job.id} for {job.github_repo}#{job.issue_number}")
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

    # ── Active PR watch ────────────────────────────────────────────────────────

    def _pr_key(self, github_repo: str, pr_number: int) -> str:
        return f"pr:{github_repo}:{pr_number}"

    def _pr_seen_key(self, github_repo: str, pr_number: int) -> str:
        return f"pr:{github_repo}:{pr_number}:seen_comments"

    async def register_active_pr(self, pr: ActivePR) -> None:
        key = self._pr_key(pr.github_repo, pr.pr_number)
        await self._redis.hset(key, mapping={
            "job_id": pr.job_id,
            "github_repo": pr.github_repo,
            "pr_number": str(pr.pr_number),
            "issue_number": str(pr.issue_number),
            "repo_path": pr.repo_path,
            "registered_at": pr.registered_at.isoformat(),
        })
        await self._redis.sadd("prs:active", f"{pr.github_repo}:{pr.pr_number}")

    async def get_active_pr(self, github_repo: str, pr_number: int) -> ActivePR | None:
        data = await self._redis.hgetall(self._pr_key(github_repo, pr_number))
        if not data:
            return None
        return ActivePR(
            job_id=data["job_id"],
            github_repo=data["github_repo"],
            pr_number=int(data["pr_number"]),
            issue_number=int(data["issue_number"]),
            repo_path=data["repo_path"],
            registered_at=datetime.fromisoformat(data["registered_at"]),
        )

    async def list_active_prs(self) -> list[ActivePR]:
        members = await self._redis.smembers("prs:active")
        prs = []
        for member in members:
            repo, pr_num = member.rsplit(":", 1)
            pr = await self.get_active_pr(repo, int(pr_num))
            if pr:
                prs.append(pr)
        return prs

    async def deregister_pr(self, github_repo: str, pr_number: int) -> None:
        await self._redis.delete(self._pr_key(github_repo, pr_number))
        await self._redis.srem("prs:active", f"{github_repo}:{pr_number}")

    async def is_pr_comment_seen(self, github_repo: str, pr_number: int, comment_id: str) -> bool:
        return await self._redis.sismember(self._pr_seen_key(github_repo, pr_number), comment_id)

    async def mark_pr_comment_seen(self, github_repo: str, pr_number: int, comment_id: str) -> None:
        await self._redis.sadd(self._pr_seen_key(github_repo, pr_number), comment_id)

    # ── PR review job queue ─────────────────────────────────────────────────────

    async def enqueue_pr_review(self, job: PRReviewJob) -> None:
        key = f"pr_review:{job.id}"
        await self._redis.hset(key, mapping={
            "id": job.id,
            "github_repo": job.github_repo,
            "pr_number": str(job.pr_number),
            "issue_number": str(job.issue_number),
            "repo_path": job.repo_path,
            "comment_id": job.comment_id,
            "comment_body": job.comment_body,
            "pr_url": job.pr_url,
            "created_at": job.created_at.isoformat(),
        })
        await self._redis.rpush("pr_review:queue", job.id)

    async def dequeue_pr_review(self, timeout: int = 5) -> PRReviewJob | None:
        result = await self._redis.blpop("pr_review:queue", timeout=timeout)
        if not result:
            return None
        _, job_id = result
        data = await self._redis.hgetall(f"pr_review:{job_id}")
        if not data:
            return None
        return PRReviewJob(
            id=data["id"],
            github_repo=data["github_repo"],
            pr_number=int(data["pr_number"]),
            issue_number=int(data["issue_number"]),
            repo_path=data["repo_path"],
            comment_id=data["comment_id"],
            comment_body=data["comment_body"],
            pr_url=data["pr_url"],
            created_at=datetime.fromisoformat(data["created_at"]),
        )

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
            "issue_number": str(job.issue_number),
            "issue_title": job.issue_title,
            "issue_body": job.issue_body,
            "spec_name": job.spec_name,
            "stage": job.stage.value,
            "status": job.status.value,
            "account_id": job.account_id,
            "pr_comment_id": str(job.pr_comment_id) if job.pr_comment_id else "",
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
            "completed_at": job.completed_at.isoformat() if job.completed_at else "",
            "pr_number": str(job.pr_number) if job.pr_number else "",
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
            issue_number=int(data["issue_number"]),
            issue_title=data["issue_title"],
            issue_body=data["issue_body"],
            spec_name=data["spec_name"],
            stage=JobStage(data["stage"]),
            status=JobStatus(data["status"]),
            account_id=data["account_id"],
            pr_comment_id=int(data["pr_comment_id"]) if data.get("pr_comment_id") else None,
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            completed_at=_dt(data.get("completed_at", "")),
            pr_number=int(data["pr_number"]) if data.get("pr_number") else None,
            pr_url=data.get("pr_url") or None,
            error=data.get("error") or None,
        )

    # ── Factory ────────────────────────────────────────────────────────────────

    @staticmethod
    def make_job(
        github_repo: str,
        issue_number: int,
        issue_title: str,
        issue_body: str,
        repo_path: str,
        account_id: str = "primary",
    ) -> Job:
        cockpit_prefix = "[COCKPIT] "
        spec_name = issue_title[len(cockpit_prefix):].strip() if issue_title.startswith(cockpit_prefix) else issue_title
        now = datetime.utcnow()
        return Job(
            id=str(uuid.uuid4())[:8],
            repo_path=repo_path,
            github_repo=github_repo,
            issue_number=issue_number,
            issue_title=issue_title,
            issue_body=issue_body,
            spec_name=spec_name,
            stage=JobStage.IDLE,
            status=JobStatus.QUEUED,
            account_id=account_id,
            created_at=now,
            updated_at=now,
        )
