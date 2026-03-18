"""Manages individual Claude Code CLI processes via PTY."""
import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class ClaudeProcess:
    """Wraps a single Claude Code CLI session.

    Uses 'claude -p' (print mode) for each command — interactive TUI mode
    does not write to its PTY stdout (it uses VS Code extension IPC instead),
    so print mode is the only reliable way to capture output.
    """

    def __init__(self, repo_path: str, config_dir: str, session_id: str, extra_flags: list[str] | None = None):
        self.repo_path = Path(repo_path).expanduser().resolve()
        self.config_dir = Path(config_dir).expanduser().resolve()
        self.session_id = session_id
        self.extra_flags: list[str] = extra_flags or []

        self.pid: int | None = None
        self.is_running: bool = False
        self.started_at: datetime | None = None
        self.last_activity: datetime | None = None
        self.message_count: int = 0

    async def start(self):
        """Mark session as active. No persistent process — each send_oneshot
        spawns a fresh 'claude -p' invocation."""
        if self.is_running:
            raise RuntimeError(f"Session {self.session_id} already running")
        if not self.repo_path.exists():
            raise FileNotFoundError(f"Repo path not found: {self.repo_path}")
        self.is_running = True
        self.started_at = datetime.now()
        self.last_activity = datetime.now()
        logger.info(f"Started Claude session {self.session_id} in {self.repo_path}")

    async def send_oneshot(self, message: str, timeout: float = 1800.0) -> str:
        """Run 'claude -p <message>' and return the full output.

        Each call is independent — Claude re-reads files from the repo so
        spec-kit stages chain correctly without a persistent session.
        """
        if not self.is_running:
            raise RuntimeError("Session not running")

        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = str(self.config_dir)

        # Build flags: extra_flags (e.g. --dangerously-skip-permissions) + -p mode
        proc = await asyncio.create_subprocess_exec(
            "claude", *self.extra_flags, "-p", message,
            "--output-format", "text",
            cwd=str(self.repo_path),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        self.pid = proc.pid
        self.message_count += 1
        self.last_activity = datetime.now()

        logger.info(f"Session {self.session_id}: claude -p (PID {proc.pid}): {message[:80]}...")

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise

        self.pid = None

        stdout_text = stdout.decode(errors="replace")
        stderr_text = stderr.decode(errors="replace")

        if proc.returncode != 0:
            # Claude Code sometimes puts errors in stdout, sometimes stderr
            combined = (stdout_text + stderr_text).strip()
            logger.error(f"Claude error in {self.session_id} (rc={proc.returncode}): {combined[:500]}")
            return f"Error: {combined}"

        return stdout_text

    async def stop(self):
        """Mark session as stopped."""
        self.is_running = False
        self.pid = None
        logger.info(f"Stopped session {self.session_id}")

    def check_rate_limited(self) -> bool:
        return False  # No output buffer to check; handled per-invocation
