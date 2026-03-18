"""Polls GitHub for [COCKPIT]-prefixed issues and enqueues jobs."""
import asyncio
import logging

import httpx

from config import settings
from services.job_store import JobStore

logger = logging.getLogger(__name__)

COCKPIT_PREFIX = "[COCKPIT]"
GITHUB_API = "https://api.github.com"


class GithubWatcher:
    """Background task that polls configured repos for [COCKPIT] issues."""

    def __init__(self, job_store: JobStore):
        self._job_store = job_store
        self._running = False
        self._task: asyncio.Task | None = None
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if not settings.github_token:
            logger.warning("GITHUB_TOKEN not set — GithubWatcher disabled")
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
        logger.info(
            f"GithubWatcher started — watching {settings.github_repos} "
            f"every {settings.github_poll_interval}s"
        )

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
        logger.info("GithubWatcher stopped")

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"GithubWatcher poll error: {e}")
            await asyncio.sleep(settings.github_poll_interval)

    async def _poll_once(self) -> None:
        for repo in settings.github_repos:
            try:
                await self._poll_repo(repo)
            except Exception as e:
                logger.error(f"Error polling {repo}: {e}")

    async def _poll_repo(self, repo: str) -> None:
        # GitHub issues API returns both issues and PRs; filter PRs out via pull_request key
        url = f"{GITHUB_API}/repos/{repo}/issues"
        resp = await self._client.get(
            url, params={"state": "open", "per_page": 50}
        )

        if resp.status_code == 401:
            logger.error("GitHub token rejected (401) — check GITHUB_TOKEN")
            return
        if resp.status_code != 200:
            logger.warning(f"GitHub API {resp.status_code} for {repo}")
            return

        items = resp.json()
        for item in items:
            # Skip pull requests (they appear in the issues list too)
            if item.get("pull_request"):
                continue

            title: str = item.get("title", "")
            if not title.startswith(COCKPIT_PREFIX):
                continue

            # Only process issues opened by the configured owner
            author: str = item.get("user", {}).get("login", "")
            if author != settings.github_owner:
                logger.debug(f"Skipping issue #{item['number']} from {author} (not owner)")
                continue

            await self._maybe_enqueue(repo, item)

    async def _maybe_enqueue(self, repo: str, issue: dict) -> None:
        issue_number = issue["number"]
        local_path = settings.get_local_path(repo)

        if local_path is None:
            logger.warning(
                f"No local path configured for {repo} — cannot run pipeline. "
                f"Set REPO_LOCAL_PATHS or ensure ~/repos/{repo.split('/')[-1]} exists."
            )
            return

        job = JobStore.make_job(
            github_repo=repo,
            issue_number=issue_number,
            issue_title=issue["title"],
            issue_body=issue.get("body") or "",
            repo_path=str(local_path),
        )

        job_id = await self._job_store.enqueue(job)
        if job_id == job.id:
            logger.info(f"New job {job_id}: {repo}#{issue_number} — {job.spec_name}")
