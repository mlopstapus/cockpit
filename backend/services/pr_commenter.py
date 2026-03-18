"""Posts stage transition and status comments to GitHub PRs."""
import logging
import re

import httpx

from config import settings
from models import Job

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# ANSI escape sequence pattern for scrubbing before posting to GitHub
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[mGKHF]")


def _scrub(text: str) -> str:
    """Remove ANSI escape codes and strip to plain text."""
    return _ANSI_RE.sub("", text).strip()


class PRCommenter:
    """Posts comments to GitHub PRs to report pipeline progress."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

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
        if self._client:
            await self._client.aclose()

    async def post_stage_start(self, job: Job, stage: str) -> int | None:
        body = f"🔄 **{stage}** started"
        return await self._post(job, body)

    async def post_stage_complete(self, job: Job, stage: str, duration_s: float) -> int | None:
        body = f"✅ **{stage}** complete ({duration_s:.0f}s)"
        return await self._post(job, body)

    async def post_clarify_questions(self, job: Job, questions: list[str]) -> int | None:
        lines = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
        body = f"❓ **Clarification needed** — please reply to this comment with your answers:\n\n{lines}"
        return await self._post(job, body)

    async def post_clarify_ack(self, job: Job, reply_to_id: int) -> None:
        body = "✅ Got it — continuing"
        await self._reply(job, reply_to_id, body)

    async def post_steering_ack(self, job: Job, reply_to_id: int) -> None:
        body = "✅ Received — addressing now"
        await self._reply(job, reply_to_id, body)

    async def post_rate_limit_notice(self, job: Job) -> None:
        body = "⏸ Rate limited — rotating account and resuming"
        await self._post(job, body)

    async def post_job_complete(self, job: Job) -> None:
        pr_link = f"[View PR →]({job.pr_url})" if job.pr_url else ""
        body = f"🚀 **Pipeline complete!** All spec-kit stages done. {pr_link}\n\nReview the spec artifacts and implementation in this PR."
        await self._post(job, body)

    async def post_job_failed(self, job: Job, stage: str, reason: str) -> None:
        clean_reason = _scrub(reason)[:500]
        body = f"❌ **Pipeline failed** at **{stage}**: {clean_reason}\n\nCheck Cockpit logs for details."
        await self._post(job, body)

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _post(self, job: Job, body: str) -> int | None:
        if not settings.pr_comments_enabled:
            return None
        if not settings.github_token:
            return None

        url = f"{GITHUB_API}/repos/{job.github_repo}/issues/{job.issue_number}/comments"
        try:
            resp = await self._get_client().post(url, json={"body": body})
            if resp.status_code == 201:
                return resp.json().get("id")
            logger.warning(f"PR comment failed {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.error(f"PR comment error: {e}")
        return None

    async def _reply(self, job: Job, reply_to_id: int, body: str) -> None:
        """Post a reply in the same thread as reply_to_id (GitHub issues don't have
        threaded replies, so we post a new comment referencing the original)."""
        if not settings.pr_comments_enabled:
            return
        # GitHub doesn't support true threaded replies on issue comments,
        # so we just post a follow-up comment
        await self._post(job, body)
