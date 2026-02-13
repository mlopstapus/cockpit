"""Manages multiple Claude Code sessions."""
import logging
import uuid
from datetime import datetime

from config import settings
from models import SessionStatus, SessionInfo
from services.claude_process import ClaudeProcess
from services.account_rotator import AccountRotator

logger = logging.getLogger(__name__)


class SessionManager:
    """Orchestrates multiple concurrent Claude Code sessions."""

    def __init__(self, account_rotator: AccountRotator):
        self.sessions: dict[str, dict] = {}  # session_id -> session info + process
        self.account_rotator = account_rotator

    async def create_session(
        self,
        project_id: str,
        project: dict,
        name: str | None = None,
        account_id: str | None = None,
    ) -> SessionInfo:
        """Create and start a new Claude Code session for a project."""
        # Check concurrent session limit
        active = sum(1 for s in self.sessions.values() if s["status"] == SessionStatus.RUNNING)
        if active >= settings.max_concurrent_sessions:
            raise RuntimeError(
                f"Max concurrent sessions ({settings.max_concurrent_sessions}) reached"
            )

        repo_path = project["repo_path"]
        project_name = project["name"]

        # Pick account
        if account_id:
            account = self.account_rotator.get_account(account_id)
        else:
            account = self.account_rotator.get_best_account()

        session_id = str(uuid.uuid4())[:8]
        session_name = name or f"{project_name}-{session_id}"

        # Create Claude process
        process = ClaudeProcess(
            repo_path=repo_path,
            config_dir=account.config_dir,
            session_id=session_id,
        )

        # Store session
        now = datetime.now()
        self.sessions[session_id] = {
            "id": session_id,
            "name": session_name,
            "project_id": project_id,
            "project_name": project_name,
            "repo_path": repo_path,
            "account_id": account.id,
            "status": SessionStatus.STARTING,
            "process": process,
            "created_at": now,
            "last_activity": now,
            "message_count": 0,
        }

        # Start the process
        try:
            await process.start()
            self.sessions[session_id]["status"] = SessionStatus.RUNNING
            self.account_rotator.increment_usage(account.id)
            logger.info(f"Session {session_id} started: {session_name}")
        except Exception as e:
            self.sessions[session_id]["status"] = SessionStatus.ERROR
            logger.error(f"Failed to start session {session_id}: {e}")
            raise

        return self._to_session_info(session_id)

    async def send_message(self, session_id: str, content: str) -> None:
        """Send a message to a session."""
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        process: ClaudeProcess = session["process"]

        # Check for rate limiting before sending
        if process.check_rate_limited():
            await self._handle_rate_limit(session_id)

        await process.send(content)
        session["message_count"] += 1
        session["last_activity"] = datetime.now()

        self.account_rotator.increment_usage(session["account_id"])

    async def send_oneshot(self, session_id: str, content: str) -> str:
        """Send a one-shot command (non-interactive)."""
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        process: ClaudeProcess = session["process"]
        result = await process.send_oneshot(content)
        session["message_count"] += 1
        session["last_activity"] = datetime.now()

        return result

    async def stop_session(self, session_id: str) -> None:
        """Stop a session."""
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        process: ClaudeProcess = session["process"]
        await process.stop()
        session["status"] = SessionStatus.STOPPED
        logger.info(f"Session {session_id} stopped")

    async def _handle_rate_limit(self, session_id: str) -> None:
        """Handle rate limiting by switching accounts."""
        session = self.sessions[session_id]
        old_account_id = session["account_id"]

        # Mark current account as limited
        self.account_rotator.mark_rate_limited(old_account_id)

        # Try to get a new account
        try:
            new_account = self.account_rotator.get_best_account()
        except Exception:
            session["status"] = SessionStatus.RATE_LIMITED
            raise RuntimeError("All accounts rate limited")

        # Restart session with new account
        logger.info(
            f"Session {session_id}: switching from {old_account_id} to {new_account.id}"
        )

        process: ClaudeProcess = session["process"]
        await process.stop()

        new_process = ClaudeProcess(
            repo_path=session["repo_path"],
            config_dir=new_account.config_dir,
            session_id=session_id,
        )
        await new_process.start()

        session["process"] = new_process
        session["account_id"] = new_account.id
        session["status"] = SessionStatus.RUNNING

    def get_session(self, session_id: str) -> dict | None:
        return self.sessions.get(session_id)

    def list_sessions(self) -> list[SessionInfo]:
        return [self._to_session_info(sid) for sid in self.sessions]

    def get_process(self, session_id: str) -> ClaudeProcess | None:
        session = self.sessions.get(session_id)
        return session["process"] if session else None

    def _to_session_info(self, session_id: str) -> SessionInfo:
        s = self.sessions[session_id]
        return SessionInfo(
            id=s["id"],
            name=s["name"],
            project_id=s["project_id"],
            project_name=s["project_name"],
            repo_path=s["repo_path"],
            account_id=s["account_id"],
            status=s["status"],
            created_at=s["created_at"],
            last_activity=s["last_activity"],
            message_count=s["message_count"],
        )
