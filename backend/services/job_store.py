"""SQLite-backed job state store. Single interface to all job data."""
import asyncio
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import aiosqlite

from models import ActivePR, Job, JobStage, JobStatus, PRReviewJob

logger = logging.getLogger(__name__)

LOG_BUFFER_SIZE = 1000  # Lines retained per job
RECENT_JOBS_LIMIT = 50

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    repo_path       TEXT NOT NULL,
    github_repo     TEXT NOT NULL,
    issue_number    INTEGER NOT NULL,
    issue_title     TEXT NOT NULL,
    issue_body      TEXT NOT NULL,
    spec_name       TEXT NOT NULL,
    stage           TEXT NOT NULL DEFAULT 'idle',
    status          TEXT NOT NULL DEFAULT 'queued',
    account_id      TEXT NOT NULL DEFAULT 'primary',
    pr_comment_id   INTEGER,
    pr_number       INTEGER,
    pr_url          TEXT,
    error           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_issue   ON jobs(github_repo, issue_number);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS job_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id   TEXT NOT NULL REFERENCES jobs(id),
    line     TEXT NOT NULL,
    seq      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id, seq);

CREATE TABLE IF NOT EXISTS seen_comments (
    job_id      TEXT NOT NULL,
    comment_id  TEXT NOT NULL,
    PRIMARY KEY (job_id, comment_id)
);

CREATE TABLE IF NOT EXISTS active_prs (
    github_repo   TEXT NOT NULL,
    pr_number     INTEGER NOT NULL,
    job_id        TEXT NOT NULL,
    issue_number  INTEGER NOT NULL,
    repo_path     TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    PRIMARY KEY (github_repo, pr_number)
);

CREATE TABLE IF NOT EXISTS seen_pr_comments (
    github_repo  TEXT NOT NULL,
    pr_number    INTEGER NOT NULL,
    comment_id   TEXT NOT NULL,
    PRIMARY KEY (github_repo, pr_number, comment_id)
);

CREATE TABLE IF NOT EXISTS pr_review_jobs (
    id            TEXT PRIMARY KEY,
    github_repo   TEXT NOT NULL,
    pr_number     INTEGER NOT NULL,
    issue_number  INTEGER NOT NULL,
    repo_path     TEXT NOT NULL,
    comment_id    TEXT NOT NULL,
    comment_body  TEXT NOT NULL,
    pr_url        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pr_review_status ON pr_review_jobs(status);
"""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


class JobStore:
    """All SQLite access goes through this class. Public API is identical to the former Redis store."""

    def __init__(self):
        self._db: aiosqlite.Connection | None = None
        self._lock = asyncio.Lock()

    async def _init_db(self, db_path: str) -> None:
        """Initialize the database, creating tables if needed. Call once at startup."""
        if db_path != ":memory:":
            resolved = Path(db_path).expanduser()
            resolved.parent.mkdir(parents=True, exist_ok=True)
            db_path = str(resolved)

        self._db = await aiosqlite.connect(db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        for stmt in _SCHEMA.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await self._db.execute(stmt)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    # ── Enqueue ────────────────────────────────────────────────────────────────

    async def enqueue(self, job: Job) -> str:
        """Add a job to the queue. Deduplicates by (github_repo, issue_number)."""
        async with self._lock:
            async with self._db.execute(
                "SELECT id FROM jobs WHERE github_repo=? AND issue_number=? AND status NOT IN ('completed','failed','cancelled')",
                (job.github_repo, job.issue_number),
            ) as cur:
                row = await cur.fetchone()
                if row:
                    logger.debug(f"Issue {job.github_repo}#{job.issue_number} already queued as {row['id']}")
                    return row["id"]

            await self._db.execute(
                """INSERT INTO jobs
                   (id, repo_path, github_repo, issue_number, issue_title, issue_body,
                    spec_name, stage, status, account_id, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    job.id, job.repo_path, job.github_repo, job.issue_number,
                    job.issue_title, job.issue_body, job.spec_name,
                    job.stage.value, job.status.value, job.account_id,
                    job.created_at.isoformat(), job.updated_at.isoformat(),
                ),
            )
            await self._db.commit()
        logger.info(f"Enqueued job {job.id} for {job.github_repo}#{job.issue_number}")
        return job.id

    # ── Dequeue ────────────────────────────────────────────────────────────────

    async def dequeue(self, timeout: int = 5) -> Job | None:
        """Poll for the next queued job. Sets status to running atomically. Returns None if empty."""
        async with self._lock:
            async with self._db.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ) as cur:
                row = await cur.fetchone()
            if not row:
                return None
            job_id = row["id"]
            now = _now_iso()
            await self._db.execute(
                "UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='queued'",
                (now, job_id),
            )
            await self._db.commit()
            return self._row_to_job(dict(row) | {"status": "running", "updated_at": now})

    # ── Read / Write ───────────────────────────────────────────────────────────

    async def get(self, job_id: str) -> Job | None:
        async with self._db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        return self._row_to_job(dict(row))

    async def update(self, job_id: str, **fields) -> None:
        if not fields:
            return
        fields["updated_at"] = _now_iso()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = [self._val(v) for v in fields.values()] + [job_id]
        await self._db.execute(f"UPDATE jobs SET {set_clause} WHERE id=?", values)
        await self._db.commit()

    async def mark_active(self, job_id: str) -> None:
        await self.update(job_id, status=JobStatus.RUNNING)

    async def mark_complete(self, job_id: str) -> None:
        await self.update(
            job_id,
            status=JobStatus.COMPLETED,
            stage=JobStage.DONE,
            completed_at=_now_iso(),
        )

    async def mark_failed(self, job_id: str, reason: str) -> None:
        await self.update(
            job_id,
            status=JobStatus.FAILED,
            stage=JobStage.FAILED,
            error=reason,
            completed_at=_now_iso(),
        )

    async def mark_cancelled(self, job_id: str) -> None:
        await self.update(job_id, status=JobStatus.CANCELLED, completed_at=_now_iso())

    # ── Logs ───────────────────────────────────────────────────────────────────

    async def append_log(self, job_id: str, line: str) -> None:
        async with self._lock:
            async with self._db.execute(
                "SELECT COALESCE(MAX(seq), -1) FROM job_logs WHERE job_id=?", (job_id,)
            ) as cur:
                row = await cur.fetchone()
            current_max = row[0] if row[0] is not None else -1
            next_seq = current_max + 1
            await self._db.execute(
                "INSERT INTO job_logs (job_id, line, seq) VALUES (?,?,?)",
                (job_id, line, next_seq),
            )
            # Trim: keep only the last LOG_BUFFER_SIZE lines
            # After this insert, next_seq is the newest line; delete older ones
            trim_below = next_seq - LOG_BUFFER_SIZE + 1
            if trim_below > 0:
                await self._db.execute(
                    "DELETE FROM job_logs WHERE job_id=? AND seq < ?",
                    (job_id, trim_below),
                )
            await self._db.commit()

    async def get_log_tail(self, job_id: str, n: int = 200) -> list[str]:
        async with self._db.execute(
            "SELECT line FROM job_logs WHERE job_id=? ORDER BY seq DESC LIMIT ?",
            (job_id, n),
        ) as cur:
            rows = await cur.fetchall()
        # Rows come back newest-first; reverse to restore chronological order
        return [r[0] for r in reversed(rows)]

    # ── Comment dedup ──────────────────────────────────────────────────────────

    async def is_comment_seen(self, job_id: str, comment_id: int) -> bool:
        async with self._db.execute(
            "SELECT 1 FROM seen_comments WHERE job_id=? AND comment_id=?",
            (job_id, str(comment_id)),
        ) as cur:
            return await cur.fetchone() is not None

    async def mark_comment_seen(self, job_id: str, comment_id: int) -> None:
        await self._db.execute(
            "INSERT OR IGNORE INTO seen_comments (job_id, comment_id) VALUES (?,?)",
            (job_id, str(comment_id)),
        )
        await self._db.commit()

    # ── List ───────────────────────────────────────────────────────────────────

    async def list_active(self) -> list[Job]:
        async with self._db.execute(
            "SELECT * FROM jobs WHERE status='running' ORDER BY created_at DESC"
        ) as cur:
            rows = await cur.fetchall()
        return [self._row_to_job(dict(r)) for r in rows]

    async def list_recent(self, limit: int = RECENT_JOBS_LIMIT) -> list[Job]:
        async with self._db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
        return [self._row_to_job(dict(r)) for r in rows]

    # ── Active PR watch ────────────────────────────────────────────────────────

    async def register_active_pr(self, pr: ActivePR) -> None:
        await self._db.execute(
            """INSERT OR REPLACE INTO active_prs
               (github_repo, pr_number, job_id, issue_number, repo_path, registered_at)
               VALUES (?,?,?,?,?,?)""",
            (pr.github_repo, pr.pr_number, pr.job_id, pr.issue_number,
             pr.repo_path, pr.registered_at.isoformat()),
        )
        await self._db.commit()

    async def get_active_pr(self, github_repo: str, pr_number: int) -> ActivePR | None:
        async with self._db.execute(
            "SELECT * FROM active_prs WHERE github_repo=? AND pr_number=?",
            (github_repo, pr_number),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        return ActivePR(
            job_id=d["job_id"],
            github_repo=d["github_repo"],
            pr_number=d["pr_number"],
            issue_number=d["issue_number"],
            repo_path=d["repo_path"],
            registered_at=datetime.fromisoformat(d["registered_at"]),
        )

    async def list_active_prs(self) -> list[ActivePR]:
        async with self._db.execute("SELECT * FROM active_prs") as cur:
            rows = await cur.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            result.append(ActivePR(
                job_id=d["job_id"],
                github_repo=d["github_repo"],
                pr_number=d["pr_number"],
                issue_number=d["issue_number"],
                repo_path=d["repo_path"],
                registered_at=datetime.fromisoformat(d["registered_at"]),
            ))
        return result

    async def deregister_pr(self, github_repo: str, pr_number: int) -> None:
        await self._db.execute(
            "DELETE FROM active_prs WHERE github_repo=? AND pr_number=?",
            (github_repo, pr_number),
        )
        await self._db.commit()

    async def is_pr_comment_seen(self, github_repo: str, pr_number: int, comment_id: str) -> bool:
        async with self._db.execute(
            "SELECT 1 FROM seen_pr_comments WHERE github_repo=? AND pr_number=? AND comment_id=?",
            (github_repo, pr_number, comment_id),
        ) as cur:
            return await cur.fetchone() is not None

    async def mark_pr_comment_seen(self, github_repo: str, pr_number: int, comment_id: str) -> None:
        await self._db.execute(
            "INSERT OR IGNORE INTO seen_pr_comments (github_repo, pr_number, comment_id) VALUES (?,?,?)",
            (github_repo, pr_number, comment_id),
        )
        await self._db.commit()

    # ── PR review job queue ────────────────────────────────────────────────────

    async def enqueue_pr_review(self, job: PRReviewJob) -> None:
        await self._db.execute(
            """INSERT INTO pr_review_jobs
               (id, github_repo, pr_number, issue_number, repo_path,
                comment_id, comment_body, pr_url, status, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (job.id, job.github_repo, job.pr_number, job.issue_number,
             job.repo_path, job.comment_id, job.comment_body, job.pr_url,
             "queued", job.created_at.isoformat()),
        )
        await self._db.commit()

    async def dequeue_pr_review(self, timeout: int = 5) -> PRReviewJob | None:
        async with self._lock:
            async with self._db.execute(
                "SELECT * FROM pr_review_jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ) as cur:
                row = await cur.fetchone()
            if not row:
                return None
            d = dict(row)
            await self._db.execute(
                "UPDATE pr_review_jobs SET status='running' WHERE id=? AND status='queued'",
                (d["id"],),
            )
            await self._db.commit()
        return PRReviewJob(
            id=d["id"],
            github_repo=d["github_repo"],
            pr_number=d["pr_number"],
            issue_number=d["issue_number"],
            repo_path=d["repo_path"],
            comment_id=d["comment_id"],
            comment_body=d["comment_body"],
            pr_url=d["pr_url"],
            created_at=datetime.fromisoformat(d["created_at"]),
        )

    # ── Serialization helpers ──────────────────────────────────────────────────

    @staticmethod
    def _val(v: Any) -> str | int | None:
        if v is None:
            return None
        if isinstance(v, (JobStage, JobStatus)):
            return v.value
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @staticmethod
    def _row_to_job(d: dict) -> Job:
        def _dt(s: str | None) -> datetime | None:
            return datetime.fromisoformat(s) if s else None

        return Job(
            id=d["id"],
            repo_path=d["repo_path"],
            github_repo=d["github_repo"],
            issue_number=d["issue_number"],
            issue_title=d["issue_title"],
            issue_body=d["issue_body"],
            spec_name=d["spec_name"],
            stage=JobStage(d["stage"]),
            status=JobStatus(d["status"]),
            account_id=d["account_id"],
            pr_comment_id=d.get("pr_comment_id"),
            created_at=datetime.fromisoformat(d["created_at"]),
            updated_at=datetime.fromisoformat(d["updated_at"]),
            completed_at=_dt(d.get("completed_at")),
            pr_number=d.get("pr_number"),
            pr_url=d.get("pr_url") or None,
            error=d.get("error") or None,
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
