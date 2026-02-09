"""Manages interactive Claude login process via PTY."""
import asyncio
import logging
import os
import pty
import select
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class AuthProcess:
    """Spawns and manages an interactive `claude login` session for account re-authentication."""

    def __init__(self, account_id: str, config_dir: str):
        self.account_id = account_id
        self.config_dir = Path(config_dir).expanduser().resolve()

        self.pid: int | None = None
        self.master_fd: int | None = None
        self.is_running: bool = False
        self.started_at: datetime | None = None

        self._output_buffer: str = ""
        self._listeners: list[asyncio.Queue] = []

    async def start(self) -> None:
        """Spawn `claude login` in a PTY."""
        if self.is_running:
            raise RuntimeError(f"Auth process for {self.account_id} already running")

        # Create PTY pair
        master_fd, slave_fd = pty.openpty()

        # Set up environment
        env = os.environ.copy()
        env["CLAUDE_CONFIG_DIR"] = str(self.config_dir)
        env["TERM"] = "xterm-256color"
        env["COLUMNS"] = "100"
        env["LINES"] = "30"

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

            # Exec claude login
            os.execvpe("claude", ["claude", "login"], env)
        else:
            # Parent process
            os.close(slave_fd)
            self.pid = pid
            self.master_fd = master_fd
            self.is_running = True
            self.started_at = datetime.now()

            logger.info(f"Started auth process for account {self.account_id} (PID: {pid})")

            # Start background reader
            asyncio.create_task(self._read_loop())

    async def send_input(self, text: str) -> None:
        """Send input to the auth process."""
        if not self.is_running or self.master_fd is None:
            raise RuntimeError("Auth process not running")

        # Write to PTY with newline
        data = (text + "\n").encode()
        os.write(self.master_fd, data)

        logger.debug(f"Sent auth input for {self.account_id}: {text[:50]}...")

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to output stream."""
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Unsubscribe from output stream."""
        if queue in self._listeners:
            self._listeners.remove(queue)

    async def _read_loop(self) -> None:
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
                        # Send final marker
                        for q in self._listeners:
                            await q.put(None)
                        break

                    chunk = data.decode(errors="replace")
                    self._output_buffer += chunk

                    # Broadcast to all listeners
                    for q in self._listeners:
                        await q.put(chunk)

            except Exception as e:
                logger.error(f"Error reading auth output for {self.account_id}: {e}")
                self.is_running = False
                break

    def stop(self) -> None:
        """Kill the auth process."""
        if self.pid:
            try:
                os.kill(self.pid, 15)  # SIGTERM
                logger.info(f"Stopped auth process for {self.account_id} (PID: {self.pid})")
            except Exception as e:
                logger.error(f"Error killing auth process: {e}")
        self.is_running = False
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except:
                pass
            self.master_fd = None
