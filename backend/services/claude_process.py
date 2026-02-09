"""Manages individual Claude Code CLI processes via PTY."""
import asyncio
import logging
import os
import pty
import select
import signal
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class ClaudeProcess:
    """Wraps a single interactive Claude Code CLI session.

    Uses PTY (pseudo-terminal) so Claude Code thinks it's running
    in a real terminal — necessary for its interactive features.
    """

    def __init__(self, repo_path: str, config_dir: str, session_id: str):
        self.repo_path = Path(repo_path).expanduser().resolve()
        self.config_dir = Path(config_dir).expanduser().resolve()
        self.session_id = session_id

        self.pid: int | None = None
        self.master_fd: int | None = None
        self.is_running: bool = False
        self.started_at: datetime | None = None
        self.last_activity: datetime | None = None
        self.message_count: int = 0

        self._output_buffer: str = ""
        self._listeners: list[asyncio.Queue] = []

    async def start(self):
        """Spawn Claude Code CLI in a PTY."""
        if self.is_running:
            raise RuntimeError(f"Session {self.session_id} already running")

        # Ensure repo exists
        if not self.repo_path.exists():
            raise FileNotFoundError(f"Repo path not found: {self.repo_path}")

        # Create PTY pair
        master_fd, slave_fd = pty.openpty()

        # Set up environment
        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = str(self.config_dir)
        env["TERM"] = "xterm-256color"
        env["COLUMNS"] = "120"
        env["LINES"] = "40"

        # Fork process
        pid = os.fork()
        if pid == 0:
            # Child process
            os.close(master_fd)
            os.setsid()

            # Set slave as controlling terminal
            import fcntl
            import termios
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)

            # Redirect stdio to slave PTY
            os.dup2(slave_fd, 0)  # stdin
            os.dup2(slave_fd, 1)  # stdout
            os.dup2(slave_fd, 2)  # stderr
            if slave_fd > 2:
                os.close(slave_fd)

            # Change to repo directory
            os.chdir(str(self.repo_path))

            # Exec claude
            os.execvpe("claude", ["claude"], env)
        else:
            # Parent process
            os.close(slave_fd)
            self.pid = pid
            self.master_fd = master_fd
            self.is_running = True
            self.started_at = datetime.now()
            self.last_activity = datetime.now()

            logger.info(
                f"Started Claude session {self.session_id} "
                f"(PID: {pid}) in {self.repo_path}"
            )

            # Start background reader
            asyncio.create_task(self._read_loop())

    async def send(self, message: str) -> None:
        """Send a message to the Claude process."""
        if not self.is_running or self.master_fd is None:
            raise RuntimeError("Session not running")

        self.message_count += 1
        self.last_activity = datetime.now()

        # Write to PTY
        data = (message + "\n").encode()
        os.write(self.master_fd, data)

        logger.debug(f"Sent to session {self.session_id}: {message[:100]}...")

    async def send_oneshot(self, message: str) -> str:
        """Run a one-shot claude -p command and return the result.

        Alternative to interactive mode — simpler but no session persistence.
        """
        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = str(self.config_dir)

        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", message,
            "--output-format", "text",
            cwd=str(self.repo_path),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=300
        )

        self.message_count += 1
        self.last_activity = datetime.now()

        if proc.returncode != 0:
            error_msg = stderr.decode(errors="replace")
            logger.error(f"Claude error in {self.session_id}: {error_msg}")
            return f"Error: {error_msg}"

        return stdout.decode(errors="replace")

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to output stream. Returns a queue that receives chunks."""
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from output stream."""
        if queue in self._listeners:
            self._listeners.remove(queue)

    async def _read_loop(self):
        """Background task that reads PTY output and broadcasts to listeners."""
        loop = asyncio.get_event_loop()

        while self.is_running and self.master_fd is not None:
            try:
                # Check if data available (non-blocking)
                ready, _, _ = await loop.run_in_executor(
                    None, select.select, [self.master_fd], [], [], 0.1
                )

                if ready:
                    data = await loop.run_in_executor(
                        None, os.read, self.master_fd, 4096
                    )

                    if not data:
                        # EOF — process exited
                        self.is_running = False
                        break

                    chunk = data.decode(errors="replace")
                    self._output_buffer += chunk
                    self.last_activity = datetime.now()

                    # Broadcast to all listeners
                    for queue in self._listeners:
                        await queue.put(chunk)

            except OSError:
                # PTY closed
                self.is_running = False
                break
            except Exception as e:
                logger.error(f"Read error in session {self.session_id}: {e}")
                await asyncio.sleep(0.5)

        logger.info(f"Read loop ended for session {self.session_id}")

    async def stop(self):
        """Gracefully stop the Claude process."""
        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
                # Wait a moment for graceful shutdown
                await asyncio.sleep(2)
                try:
                    os.kill(self.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass  # Already dead
            except ProcessLookupError:
                pass  # Already dead

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass

        self.is_running = False
        self.pid = None
        self.master_fd = None

        # Notify listeners of shutdown
        for queue in self._listeners:
            await queue.put(None)  # Sentinel value

        logger.info(f"Stopped session {self.session_id}")

    def get_output_history(self) -> str:
        """Get all buffered output."""
        return self._output_buffer

    def check_rate_limited(self) -> bool:
        """Check if recent output suggests rate limiting."""
        recent = self._output_buffer[-2000:]  # Last 2KB
        rate_limit_signals = [
            "rate limit",
            "rate_limit",
            "please wait",
            "too many requests",
            "usage limit",
            "try again in",
        ]
        return any(signal in recent.lower() for signal in rate_limit_signals)
