"""Dequeues jobs from Redis and runs spec-kit stages sequentially via PTY."""
import asyncio
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from config import settings
from models import Job, JobStatus
from services.account_rotator import AccountRotator
from services.claude_process import ClaudeProcess
from services.comment_relay import CommentRelay
from services.job_store import JobStore
from services.pr_commenter import PRCommenter
from ws.hub import WebSocketHub

logger = logging.getLogger(__name__)

STAGE_TIMEOUT = settings.stage_timeout_minutes * 60
CLARIFY_TIMEOUT = settings.clarify_timeout_hours * 3600
CLAUDE_READY_WAIT = 3.0

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
            await asyncio.sleep(CLAUDE_READY_WAIT)

            for stage in STAGES:
                success = await self._run_stage(job, process, stage, inject_queue)
                if not success:
                    return

            await self._job_store.mark_complete(job.id)
            await self._pr_commenter.post_job_complete(job)
            logger.info(f"Pipeline complete for job {job.id}")

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
        """Run a single stage. Returns True on success, False on failure."""
        stage_name = stage.name
        logger.info(f"Job {job.id}: stage {stage_name}")
        await self._job_store.update(job.id, stage=stage_name, status=JobStatus.RUNNING)
        await self._pr_commenter.post_stage_start(job, stage_name)
        t_start = time.monotonic()

        cmd = stage.command_template.format(
            spec_name=job.spec_name,
            issue_body=job.issue_body[:2000],
        )
        await process.send(cmd)

        output_q: asyncio.Queue = process.subscribe()
        accumulated = ""

        try:
            deadline = time.monotonic() + STAGE_TIMEOUT

            while True:
                if time.monotonic() >= deadline:
                    reason = f"Stage '{stage_name}' timed out after {STAGE_TIMEOUT}s"
                    logger.warning(f"Job {job.id}: {reason}")
                    await self._job_store.mark_failed(job.id, reason)
                    await self._pr_commenter.post_job_failed(job, stage_name, reason)
                    return False

                try:
                    chunk: str | None = await asyncio.wait_for(output_q.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    await self._drain_inject_queue(inject_queue, process)
                    continue

                if chunk is None:
                    reason = f"PTY closed during stage '{stage_name}'"
                    await self._job_store.mark_failed(job.id, reason)
                    await self._pr_commenter.post_job_failed(job, stage_name, reason)
                    return False

                await self._hub.broadcast_raw(job.id, chunk)
                await self._job_store.append_log(job.id, chunk)
                accumulated += chunk

                # Clarify stage: detect questions and wait for owner's reply
                if stage_name == "clarify":
                    posted = await self._comment_relay.post_clarify_questions(job.id, accumulated)
                    if posted:
                        if not await self._wait_for_clarification(job, inject_queue, process):
                            return False
                        break

                if self._stage_complete(stage_name, accumulated):
                    duration = time.monotonic() - t_start
                    await self._pr_commenter.post_stage_complete(job, stage_name, duration)
                    logger.info(f"Job {job.id}: {stage_name} complete ({duration:.0f}s)")

                    if stage_name == "implement":
                        pr_url = self._extract_pr_url(accumulated)
                        if pr_url:
                            await self._job_store.update(job.id, pr_url=pr_url)

                    break

        finally:
            process.unsubscribe(output_q)

        return True

    async def _wait_for_clarification(
        self, job: Job, inject_queue: asyncio.Queue, process: ClaudeProcess
    ) -> bool:
        """Block until the owner answers the clarify question or timeout."""
        await self._job_store.update(job.id, status=JobStatus.AWAITING_CLARIFICATION)
        logger.info(f"Job {job.id}: awaiting clarification")
        deadline = time.monotonic() + CLARIFY_TIMEOUT

        while time.monotonic() < deadline:
            try:
                answer = await asyncio.wait_for(inject_queue.get(), timeout=30.0)
                await process.send(answer)
                await self._job_store.update(job.id, status=JobStatus.RUNNING)
                logger.info(f"Job {job.id}: clarify answer injected")
                return True
            except asyncio.TimeoutError:
                current = await self._job_store.get(job.id)
                if current and current.status == JobStatus.CANCELLED:
                    return False

        # Timeout — proceed with assumptions
        logger.warning(f"Job {job.id}: clarify timeout — proceeding")
        await process.send("No clarification received — proceeding with best-effort assumptions.")
        await self._job_store.update(job.id, status=JobStatus.RUNNING)
        return True

    async def _drain_inject_queue(self, inject_queue: asyncio.Queue, process: ClaudeProcess) -> None:
        while not inject_queue.empty():
            try:
                await process.send(inject_queue.get_nowait())
            except asyncio.QueueEmpty:
                break

    @staticmethod
    def _stage_complete(stage_name: str, text: str) -> bool:
        return any(s in text.lower() for s in _SENTINELS.get(stage_name, []))

    @staticmethod
    def _extract_pr_url(text: str) -> str | None:
        match = re.search(r"https://github\.com/[^\s]+/pull/\d+", text)
        return match.group(0) if match else None
