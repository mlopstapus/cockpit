"""API models for Claude Cockpit."""
from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class JobStage(str, Enum):
    IDLE = "idle"
    SPECIFY = "specify"
    CLARIFY = "clarify"
    PLAN = "plan"
    TASKS = "tasks"
    ANALYZE = "analyze"
    IMPLEMENT = "implement"
    DONE = "done"
    FAILED = "failed"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_CLARIFICATION = "awaiting_clarification"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AuthStatus(str, Enum):
    AUTHENTICATED = "authenticated"
    NEEDS_AUTH = "needs_auth"
    AUTHENTICATING = "authenticating"
    ERROR = "error"


# --- Job models ---

class Job(BaseModel):
    id: str
    repo_path: str            # local filesystem path
    github_repo: str          # "owner/repo"
    pr_number: int
    pr_title: str
    pr_body: str
    spec_name: str            # title stripped of "[COCKPIT] " prefix
    branch: str
    stage: JobStage = JobStage.IDLE
    status: JobStatus = JobStatus.QUEUED
    account_id: str = "primary"
    pr_comment_id: int | None = None   # ID of latest clarify question comment
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    pr_url: str | None = None          # GitHub PR URL
    error: str | None = None


class JobSummary(BaseModel):
    """Lightweight job info for list endpoints."""
    id: str
    github_repo: str
    pr_number: int
    pr_title: str
    spec_name: str
    stage: JobStage
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    pr_url: str | None = None


# --- Account models ---

class AccountInfo(BaseModel):
    id: str
    name: str
    tier: str
    priority: int
    auth_status: AuthStatus = AuthStatus.AUTHENTICATED
    is_rate_limited: bool = False
    rate_limit_until: float = 0
    messages_today: int = 0
    daily_estimate: int = 100


# --- Auth models (reused from original) ---

class AuthStatusResponse(BaseModel):
    account_id: str
    status: AuthStatus
    last_checked: datetime
    config_dir: str
    needs_reauth: bool = False
    error_message: str | None = None


class AuthInitiateResponse(BaseModel):
    account_id: str
    status: str
    message: str
    instructions: str | None = None


# --- WebSocket messages ---

class WSMessageType(str, Enum):
    LOG = "log"
    STAGE_CHANGE = "stage_change"
    JOB_COMPLETE = "job_complete"
    JOB_FAILED = "job_failed"
    STATUS = "status"
    OUTPUT = "output"
    ACCOUNT_SWITCH = "account_switch"


class WSMessage(BaseModel):
    type: WSMessageType
    job_id: str
    data: dict
    timestamp: datetime | None = None

    def __init__(self, **kwargs):
        if not kwargs.get("timestamp"):
            kwargs["timestamp"] = datetime.now()
        super().__init__(**kwargs)
