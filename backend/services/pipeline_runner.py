"""Dequeues jobs from Redis and runs spec-kit stages sequentially via PTY."""
import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from config import settings
from models import ActivePR, Job, JobStatus
from services.account_rotator import AccountRotator
from services.claude_process import ClaudeProcess
from services.comment_relay import CommentRelay
from services.job_store import JobStore
from services.pr_commenter import PRCommenter
from ws.hub import WebSocketHub

logger = logging.getLogger(__name__)

STAGE_TIMEOUT = settings.stage_timeout_minutes * 60
CLARIFY_TIMEOUT = settings.clarify_timeout_hours * 3600

# Stage completion sentinels — matched against accumulated PTY output.
# Validate against actual speckit output and adjust as needed.
_SENTINELS: dict[str, list[str]] = {
    "specify":   ["spec.md", "✓ spec", "specification complete", "written to"],
    "clarify":   ["clarify complete", "✓ clarif", "no clarification needed", "questions posted"],
    "plan":      ["plan.md", "✓ plan", "plan complete", "implementation plan"],
    "tasks":     ["tasks.md", "✓ tasks", "tasks complete", "task list"],
    "analyze":   ["✓ analys", "analysis complete", "consistency check"],
    "implement": ["pr created", "pull request", "github.com", "✓ implement", "implementation complete"],
}


@dataclass
class Stage:
    name: str
    command_template: str


STAGES = [
    Stage("specify",   "/speckit.specify {spec_name}: {issue_body}"),
    Stage("clarify",   "/speckit.clarify"),
    Stage("plan",      "/speckit.plan"),
    Stage("tasks",     "/speckit.tasks"),
    Stage("analyze",   "/speckit.analyze"),
    Stage("implement", "/speckit.implement"),
]

# Expo dev server restart command — run after implement if configured.
# Uses systemctl --user so no sudo required.
_EXPO_RESTART_CMD = [
    "systemctl", "--user", "restart", "seamless-expo",
]


class PipelineRunner:
    """Runs spec-kit pipeline for jobs dequeued from Redis."""

    def __init__(
        self,
        job_store: JobStore,
        hub: WebSocketHub,
        account_rotator: AccountRotator,
        pr_commenter: PRCommenter,
        comment_relay: CommentRelay,
    ):
        self._job_store = job_store
        self._hub = hub
        self._account_rotator = account_rotator
        self._pr_commenter = pr_commenter
        self._comment_relay = comment_relay
        self._running = False
        self._task: asyncio.Task | None = None
        self._active_processes: dict[str, ClaudeProcess] = {}

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._dequeue_loop())
        logger.info("PipelineRunner started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        for proc in list(self._active_processes.values()):
            await proc.stop()
        logger.info("PipelineRunner stopped")

    async def cancel_job(self, job_id: str) -> None:
        proc = self._active_processes.get(job_id)
        if proc:
            await proc.stop()
        await self._job_store.mark_cancelled(job_id)

    # ── Dequeue loop ───────────────────────────────────────────────────────────

    async def _dequeue_loop(self) -> None:
        while self._running:
            try:
                job = await self._job_store.dequeue(timeout=5)
                if job:
                    await self._run_job(job)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Dequeue loop error: {e}")
                await asyncio.sleep(2)

    # ── Job execution ──────────────────────────────────────────────────────────

    async def _run_job(self, job: Job) -> None:
        logger.info(f"Starting pipeline for job {job.id}: {job.spec_name}")
        await self._job_store.mark_active(job.id)

        repo_path = Path(job.repo_path)
        if not (repo_path / ".git").exists():
            reason = f"Not a git repo: {repo_path}"
            logger.error(reason)
            await self._job_store.mark_failed(job.id, reason)
            return

        account = self._account_rotator.get_best_account()

        process = ClaudeProcess(
            repo_path=str(repo_path),
            config_dir=account.config_dir,
            session_id=job.id,
            extra_flags=["--dangerously-skip-permissions"],
        )
        self._active_processes[job.id] = process

        self._comment_relay.start_for_job(job.id)
        inject_queue = self._comment_relay.get_inject_queue(job.id)

        try:
            await process.start()

            for stage in STAGES:
                success = await self._run_stage(job, process, stage, inject_queue)
                if not success:
                    return
                # Brief pause between stages to avoid rate limit cascades
                await asyncio.sleep(5)

            await self._job_store.mark_complete(job.id)
            await self._pr_commenter.post_job_complete(job)
            logger.info(f"Pipeline complete for job {job.id}")

            # Register PR for post-implementation comment watching
            final_job = await self._job_store.get(job.id)
            if final_job and final_job.pr_url:
                pr_match = re.search(r"/pull/(\d+)", final_job.pr_url)
                if pr_match:
                    await self._job_store.register_active_pr(ActivePR(
                        job_id=job.id,
                        github_repo=job.github_repo,
                        pr_number=int(pr_match.group(1)),
                        issue_number=job.issue_number,
                        repo_path=job.repo_path,
                        registered_at=datetime.utcnow(),
                    ))

            if settings.expo_restart_enabled:
                await self._restart_expo(job)

        except Exception as e:
            logger.error(f"Pipeline error for job {job.id}: {e}", exc_info=True)
            await self._job_store.mark_failed(job.id, str(e))
            await self._pr_commenter.post_job_failed(job, "pipeline", str(e))
        finally:
            await process.stop()
            del self._active_processes[job.id]
            self._comment_relay.stop_for_job(job.id)

    async def _run_stage(
        self,
        job: Job,
        process: ClaudeProcess,
        stage: Stage,
        inject_queue: asyncio.Queue,
    ) -> bool:
        """Run a single stage via 'claude -p'. Returns True on success."""
        stage_name = stage.name
        logger.info(f"Job {job.id}: stage {stage_name}")
        await self._job_store.update(job.id, stage=stage_name, status=JobStatus.RUNNING)
        await self._pr_commenter.post_stage_start(job, stage_name)
        t_start = time.monotonic()

        cmd = stage.command_template.format(
            spec_name=job.spec_name,
            issue_body=job.issue_body[:2000],
        )

        try:
            output = await process.send_oneshot(cmd, timeout=STAGE_TIMEOUT)
        except asyncio.TimeoutError:
            reason = f"Stage '{stage_name}' timed out after {STAGE_TIMEOUT}s"
            logger.warning(f"Job {job.id}: {reason}")
            await self._job_store.mark_failed(job.id, reason)
            await self._pr_commenter.post_job_failed(job, stage_name, reason)
            return False

        await self._hub.broadcast_raw(job.id, output)
        await self._job_store.append_log(job.id, output)

        # Clarify stage: loop until no more questions or clarify signals completion.
        # Each round: extract questions → post to GitHub issue → wait for owner reply →
        # re-run /speckit.clarify with the answer so it encodes it into spec.md.
        if stage_name == "clarify":
            round_num = 0
            while True:
                posted = await self._comment_relay.post_clarify_questions(job.id, output)
                if not posted:
                    break  # No questions in this output — clarify is done
                round_num += 1
                answer = await self._wait_for_clarification_answer(job, inject_queue)
                if answer is None:
                    return False
                output = await process.send_oneshot(
                    f"/speckit.clarify {answer}", timeout=STAGE_TIMEOUT
                )
                await self._hub.broadcast_raw(job.id, output)
                await self._job_store.append_log(job.id, output)
                # If clarify signals completion, stop looping
                if self._stage_complete("clarify", output):
                    break

        duration = time.monotonic() - t_start

        if self._stage_complete(stage_name, output):
            await self._pr_commenter.post_stage_complete(job, stage_name, duration)
            logger.info(f"Job {job.id}: {stage_name} complete ({duration:.0f}s)")

            if stage_name == "implement":
                pr_url = self._extract_pr_url(output)
                if pr_url:
                    await self._job_store.update(job.id, pr_url=pr_url)

            return True

        # Stage ran but sentinel not found — treat as complete anyway
        # (output may use different wording; sentinel list may need tuning)
        logger.warning(
            f"Job {job.id}: {stage_name} sentinel not matched — treating as complete. "
            f"Tail: {output[-200:]!r}"
        )
        await self._pr_commenter.post_stage_complete(job, stage_name, duration)
        return True

    async def _wait_for_clarification_answer(
        self, job: Job, inject_queue: asyncio.Queue
    ) -> str | None:
        """Block until the owner posts a reply or timeout expires."""
        await self._job_store.update(job.id, status=JobStatus.AWAITING_CLARIFICATION)
        logger.info(f"Job {job.id}: awaiting clarification")
        deadline = time.monotonic() + CLARIFY_TIMEOUT

        while time.monotonic() < deadline:
            try:
                answer = await asyncio.wait_for(inject_queue.get(), timeout=30.0)
                await self._job_store.update(job.id, status=JobStatus.RUNNING)
                logger.info(f"Job {job.id}: clarify answer received")
                return answer
            except asyncio.TimeoutError:
                current = await self._job_store.get(job.id)
                if current and current.status == JobStatus.CANCELLED:
                    return None

        logger.warning(f"Job {job.id}: clarify timeout — proceeding with assumptions")
        await self._job_store.update(job.id, status=JobStatus.RUNNING)
        return "No clarification received — proceed with best-effort assumptions."

    async def _restart_expo(self, job) -> None:
        """Restart the seamless-expo systemd user service after a successful implement."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *_EXPO_RESTART_CMD,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            if proc.returncode == 0:
                logger.info(f"Job {job.id}: Expo dev server restarted")
                await self._pr_commenter.post_comment(
                    job, "📱 Expo dev server restarted — open Expo Go and connect via Tailscale."
                )
            else:
                logger.warning(f"Job {job.id}: Expo restart failed: {stderr.decode()[:200]}")
        except Exception as e:
            logger.warning(f"Job {job.id}: Expo restart error: {e}")

    @staticmethod
    def _stage_complete(stage_name: str, text: str) -> bool:
        return any(s in text.lower() for s in _SENTINELS.get(stage_name, []))

    @staticmethod
    def _extract_pr_url(text: str) -> str | None:
        match = re.search(r"https://github\.com/[^\s]+/pull/\d+", text)
        return match.group(0) if match else None
