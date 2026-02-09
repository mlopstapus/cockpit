"""API models for Claude Cockpit."""
from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class SessionStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    IDLE = "idle"
    RATE_LIMITED = "rate_limited"
    ERROR = "error"
    STOPPED = "stopped"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class AuthStatus(str, Enum):
    AUTHENTICATED = "authenticated"
    NEEDS_AUTH = "needs_auth"
    AUTHENTICATING = "authenticating"
    ERROR = "error"


# --- Requests ---


class CreateSessionRequest(BaseModel):
    repo_name: str
    name: str | None = None  # Auto-generated if not provided
    account_id: str | None = None  # Auto-selected if not provided


class SendMessageRequest(BaseModel):
    content: str


# --- Responses ---


class RepoInfo(BaseModel):
    name: str
    path: str
    description: str
    default_branch: str
    docker_compose: bool
    active_sessions: int = 0


class AccountInfo(BaseModel):
    id: str
    name: str
    tier: str
    priority: int
    auth_status: AuthStatus = AuthStatus.AUTHENTICATED
    is_rate_limited: bool = False
    messages_today: int = 0
    daily_estimate: int = 100
    active_sessions: int = 0


class Message(BaseModel):
    id: str
    session_id: str
    role: MessageRole
    content: str
    timestamp: datetime


class SessionInfo(BaseModel):
    id: str
    name: str
    repo_name: str
    repo_path: str
    account_id: str
    status: SessionStatus
    created_at: datetime
    last_activity: datetime
    message_count: int = 0


class SessionDetail(SessionInfo):
    messages: list[Message] = []


# --- WebSocket Messages ---


class WSMessageType(str, Enum):
    OUTPUT = "output"          # Streaming output from Claude
    STATUS = "status"          # Session status change
    ERROR = "error"            # Error occurred
    ACCOUNT_SWITCH = "account_switch"  # Account was rotated
    TASK_COMPLETE = "task_complete"     # Claude finished a task


class WSMessage(BaseModel):
    type: WSMessageType
    session_id: str
    data: dict
    timestamp: datetime = None

    def __init__(self, **kwargs):
        if "timestamp" not in kwargs or kwargs["timestamp"] is None:
            kwargs["timestamp"] = datetime.now()
        super().__init__(**kwargs)


# --- Auth Management ---


class AuthStatusResponse(BaseModel):
    account_id: str
    status: AuthStatus
    last_checked: datetime
    config_dir: str
    needs_reauth: bool = False
    error_message: str | None = None


class AuthInitiateResponse(BaseModel):
    account_id: str
    status: str  # "initiated", "already_authenticated", etc.
    message: str
    instructions: str | None = None
