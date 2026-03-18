"""Dequeues PRReviewJobs and runs Claude to address each review comment."""
import asyncio
import logging

from config import settings
from services.account_rotator import AccountRotator
from services.claude_process import ClaudeProcess
from services.job_store import JobStore
from services.pr_commenter import PRCommenter

logger = logging.getLogger(__name__)

REVIEW_TIMEOUT = settings.stage_timeout_minutes * 60

_PROMPT_TEMPLATE = """\
You are addressing a review comment on a GitHub PR.

PR: {pr_url}
Repository: {repo_path}

The reviewer left this comment:
---
{comment_body}
---

Please read the relevant code in this repository, make any necessary changes to \
address the review comment, commit and push them to the existing branch, and \
reply briefly explaining what you did (or why no change was needed).
"""


class PRReviewRunner:
    """Dequeues PRReviewJobs and runs a single Claude invocation per comment."""

    def __init__(
        self,
        job_store: JobStore,
        account_rotator: AccountRotator,
        pr_commenter: PRCommenter,
    ):
        self._job_store = job_store
        self._account_rotator = account_rotator
        self._pr_commenter = pr_commenter
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._dequeue_loop())
        logger.info("PRReviewRunner started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("PRReviewRunner stopped")

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _dequeue_loop(self) -> None:
        while self._running:
            try:
                job = await self._job_store.dequeue_pr_review(timeout=5)
                if job:
                    await self._run_review(job)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"PRReviewRunner dequeue error: {e}")
                await asyncio.sleep(2)

    async def _run_review(self, job) -> None:
        logger.info(f"Handling PR review job {job.id} for {job.github_repo}#{job.pr_number}")

        account = self._account_rotator.get_best_account()
        process = ClaudeProcess(
            repo_path=job.repo_path,
            config_dir=account.config_dir,
            session_id=job.id,
            extra_flags=["--dangerously-skip-permissions"],
        )

        try:
            await process.start()
            prompt = _PROMPT_TEMPLATE.format(
                pr_url=job.pr_url,
                repo_path=job.repo_path,
                comment_body=job.comment_body[:2000],
            )
            output = await process.send_oneshot(prompt, timeout=REVIEW_TIMEOUT)
            await self._pr_commenter.post_pr_review_response(
                job.github_repo, job.pr_number, output
            )
            logger.info(f"PR review job {job.id} complete")
        except asyncio.TimeoutError:
            logger.warning(f"PR review job {job.id} timed out")
            await self._pr_commenter.post_pr_review_response(
                job.github_repo, job.pr_number,
                "❌ Timed out addressing this comment — please retry."
            )
        except Exception as e:
            logger.error(f"PR review job {job.id} error: {e}", exc_info=True)
            await self._pr_commenter.post_pr_review_response(
                job.github_repo, job.pr_number,
                f"❌ Error addressing this comment: {str(e)[:200]}"
            )
        finally:
            await process.stop()
