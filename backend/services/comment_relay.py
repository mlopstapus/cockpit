"""PR comment relay: posts clarify questions, polls for answers, injects into PTY."""
import asyncio
import html
import logging
import re
from datetime import datetime

import httpx

from config import settings
from models import JobStatus
from services.job_store import JobStore
from services.pr_commenter import PRCommenter

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
POLL_INTERVAL = 15        # seconds between comment polls
MAX_COMMENT_LENGTH = 4000 # truncate before PTY injection

# Pattern to detect numbered question list in Claude's clarify output
_QUESTION_RE = re.compile(r"^\s*\d+[\.\)]\s+.{10,}", re.MULTILINE)


class CommentRelay:
    """Manages the clarify Q&A loop and ad hoc steering comment injection."""

    def __init__(self, job_store: JobStore, pr_commenter: PRCommenter):
        self._job_store = job_store
        self._pr_commenter = pr_commenter
        self._client: httpx.AsyncClient | None = None
        # job_id -> asyncio.Queue for injecting text into the active PTY
        self._inject_queues: dict[str, asyncio.Queue] = {}
        # job_id -> poll tasks
        self._poll_tasks: dict[str, asyncio.Task] = {}

    def _get_client(self) -> httpx.AsyncClient:
        if not self._client:
            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {settings.github_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=10.0,
            )
        return self._client

    async def close(self):
        for task in self._poll_tasks.values():
            task.cancel()
        if self._client:
            await self._client.aclose()

    def get_inject_queue(self, job_id: str) -> asyncio.Queue:
        """The pipeline runner reads from this queue to inject text into PTY."""
        if job_id not in self._inject_queues:
            self._inject_queues[job_id] = asyncio.Queue()
        return self._inject_queues[job_id]

    def start_for_job(self, job_id: str) -> None:
        """Start polling PR comments for a job. Called when pipeline begins."""
        if job_id in self._poll_tasks:
            return
        task = asyncio.create_task(self._poll_loop(job_id))
        self._poll_tasks[job_id] = task

    def stop_for_job(self, job_id: str) -> None:
        task = self._poll_tasks.pop(job_id, None)
        if task:
            task.cancel()
        self._inject_queues.pop(job_id, None)

    # ── Clarify questions ──────────────────────────────────────────────────────

    async def post_clarify_questions(self, job_id: str, raw_output: str) -> bool:
        """Extract questions from PTY output and post them to the PR.

        Returns True if questions were found and posted.
        """
        job = await self._job_store.get(job_id)
        if not job:
            return False

        questions = self._extract_questions(raw_output)
        if not questions:
            logger.debug(f"No questions found in clarify output for {job_id}")
            return False

        comment_id = await self._pr_commenter.post_clarify_questions(job, questions)
        if comment_id:
            await self._job_store.update(job_id, pr_comment_id=str(comment_id))
            await self._job_store.mark_comment_seen(job_id, comment_id)
            logger.info(f"Posted {len(questions)} clarify questions for job {job_id}")
        return True

    # ── Polling loop ───────────────────────────────────────────────────────────

    async def _poll_loop(self, job_id: str) -> None:
        """Continuously polls PR comments for owner replies."""
        while True:
            try:
                job = await self._job_store.get(job_id)
                if not job:
                    break
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                    break

                await self._check_comments(job)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Comment relay poll error for {job_id}: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    async def _check_comments(self, job) -> None:
        url = f"{GITHUB_API}/repos/{job.github_repo}/issues/{job.pr_number}/comments"
        try:
            resp = await self._get_client().get(url, params={"per_page": 50})
            if resp.status_code != 200:
                return
            comments = resp.json()
        except Exception as e:
            logger.error(f"Error fetching PR comments: {e}")
            return

        for comment in comments:
            comment_id: int = comment["id"]
            author: str = comment.get("user", {}).get("login", "")

            # Only relay comments from the repo owner
            if author != settings.github_owner:
                continue

            # Skip already-processed comments
            if await self._job_store.is_comment_seen(job.id, comment_id):
                continue

            # Skip our own ack comments
            body: str = comment.get("body", "")
            if body.startswith("✅") or body.startswith("🔄") or body.startswith("❓") \
                    or body.startswith("❌") or body.startswith("🚀") or body.startswith("⏸"):
                await self._job_store.mark_comment_seen(job.id, comment_id)
                continue

            # Mark seen before injection (prevent race on retry)
            await self._job_store.mark_comment_seen(job.id, comment_id)

            # Sanitise and inject
            clean = self._sanitise(body)
            logger.info(f"Injecting owner comment into job {job.id}: {clean[:80]}")

            inject_q = self.get_inject_queue(job.id)
            await inject_q.put(clean)

            # Post acknowledgement
            if job.status == JobStatus.AWAITING_CLARIFICATION:
                await self._pr_commenter.post_clarify_ack(job, comment_id)
                # Resume pipeline
                await self._job_store.update(job.id, status=JobStatus.RUNNING)
            else:
                await self._pr_commenter.post_steering_ack(job, comment_id)

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_questions(text: str) -> list[str]:
        """Pull numbered questions from Claude's clarify output."""
        matches = _QUESTION_RE.findall(text)
        # Clean up leading numbering
        questions = []
        for m in matches:
            q = re.sub(r"^\s*\d+[\.\)]\s*", "", m).strip()
            if q:
                questions.append(q)
        return questions[:10]  # cap at 10

    @staticmethod
    def _sanitise(text: str) -> str:
        """Strip HTML and truncate for safe PTY injection."""
        # Unescape HTML entities, strip tags
        clean = re.sub(r"<[^>]+>", "", html.unescape(text))
        clean = clean.strip()
        if len(clean) > MAX_COMMENT_LENGTH:
            clean = clean[:MAX_COMMENT_LENGTH] + "\n[truncated]"
        return clean
