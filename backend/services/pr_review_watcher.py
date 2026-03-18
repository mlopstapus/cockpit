"""Watches active PRs for owner review comments and enqueues PRReviewJobs."""
import asyncio
import logging
import uuid
from datetime import datetime

import httpx

from config import settings
from models import PRReviewJob
from services.job_store import JobStore
from services.pr_commenter import PRCommenter

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
POLL_INTERVAL = 30  # seconds

# Status emoji prefixes posted by Cockpit — skip these
_COCKPIT_PREFIXES = ("✅", "🔄", "❓", "❌", "🚀", "⏸")


class PRReviewWatcher:
    """Background task that polls active PRs for owner review comments."""

    def __init__(self, job_store: JobStore, pr_commenter: PRCommenter):
        self._job_store = job_store
        self._pr_commenter = pr_commenter
        self._running = False
        self._task: asyncio.Task | None = None
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if not settings.github_token:
            logger.warning("GITHUB_TOKEN not set — PRReviewWatcher disabled")
            return
        self._running = True
        self._client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=10.0,
        )
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("PRReviewWatcher started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._client:
            await self._client.aclose()
        logger.info("PRReviewWatcher stopped")

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"PRReviewWatcher poll error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll_once(self) -> None:
        active_prs = await self._job_store.list_active_prs()
        for pr in active_prs:
            try:
                await self._poll_pr(pr)
            except Exception as e:
                logger.error(f"Error polling PR {pr.github_repo}#{pr.pr_number}: {e}")

    async def _poll_pr(self, pr) -> None:
        # Check if the PR is still open; deregister if closed/merged
        pr_resp = await self._client.get(
            f"{GITHUB_API}/repos/{pr.github_repo}/pulls/{pr.pr_number}"
        )
        if pr_resp.status_code == 200:
            state = pr_resp.json().get("state", "open")
            if state != "open":
                logger.info(f"PR {pr.github_repo}#{pr.pr_number} is {state} — deregistering")
                await self._job_store.deregister_pr(pr.github_repo, pr.pr_number)
                return
        elif pr_resp.status_code == 404:
            await self._job_store.deregister_pr(pr.github_repo, pr.pr_number)
            return

        # Fetch PR comments (issue-level comments on the PR conversation)
        url = f"{GITHUB_API}/repos/{pr.github_repo}/issues/{pr.pr_number}/comments"
        resp = await self._client.get(url, params={"per_page": 50})
        if resp.status_code != 200:
            logger.warning(f"GitHub API {resp.status_code} fetching PR comments for {pr.github_repo}#{pr.pr_number}")
            return

        pr_url = f"https://github.com/{pr.github_repo}/pull/{pr.pr_number}"

        for comment in resp.json():
            comment_id = str(comment["id"])
            author = comment.get("user", {}).get("login", "")

            if author != settings.github_owner:
                continue

            if await self._job_store.is_pr_comment_seen(pr.github_repo, pr.pr_number, comment_id):
                continue

            body: str = comment.get("body", "")
            # Skip Cockpit's own status comments
            if any(body.startswith(p) for p in _COCKPIT_PREFIXES):
                await self._job_store.mark_pr_comment_seen(pr.github_repo, pr.pr_number, comment_id)
                continue

            await self._job_store.mark_pr_comment_seen(pr.github_repo, pr.pr_number, comment_id)

            job = PRReviewJob(
                id=str(uuid.uuid4())[:8],
                github_repo=pr.github_repo,
                pr_number=pr.pr_number,
                issue_number=pr.issue_number,
                repo_path=pr.repo_path,
                comment_id=comment_id,
                comment_body=body,
                pr_url=pr_url,
                created_at=datetime.utcnow(),
            )
            await self._job_store.enqueue_pr_review(job)
            await self._pr_commenter.post_pr_review_ack(pr.github_repo, pr.pr_number, comment_id)
            logger.info(f"Enqueued PR review job {job.id} for {pr.github_repo}#{pr.pr_number}")
