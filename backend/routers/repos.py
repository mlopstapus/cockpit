"""Repo and account API routes."""
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from config import settings
from models import RepoInfo, AccountInfo, AuthStatus, AuthStatusResponse, AuthInitiateResponse

repos_router = APIRouter(prefix="/api/repos", tags=["repos"])
accounts_router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@repos_router.get("", response_model=list[RepoInfo])
async def list_repos(request: Request):
    """List all configured repos."""
    sm = request.app.state.session_manager
    repos = []
    for repo in settings.repos:
        # Count active sessions for this repo
        active = sum(
            1 for s in sm.sessions.values()
            if s["repo_name"] == repo.name and s["status"].value in ("running", "idle")
        )
        repos.append(
            RepoInfo(
                name=repo.name,
                path=repo.path,
                description=repo.description,
                default_branch=repo.default_branch,
                docker_compose=repo.docker_compose,
                active_sessions=active,
            )
        )
    return repos


@repos_router.get("/browse")
async def browse_directories(path: str = "~"):
    """Browse directories on the host machine for folder selection."""
    try:
        target = Path(path).expanduser().resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # Check if this looks like a git repo
    is_git_repo = (target / ".git").exists()

    # List subdirectories (skip hidden dirs)
    subdirs = []
    try:
        for entry in sorted(target.iterdir()):
            if entry.is_dir() and not entry.name.startswith("."):
                subdirs.append({
                    "name": entry.name,
                    "path": str(entry),
                    "is_git_repo": (entry / ".git").exists(),
                })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        "current": str(target),
        "parent": str(target.parent) if target != target.parent else None,
        "is_git_repo": is_git_repo,
        "directories": subdirs,
    }


@accounts_router.get("", response_model=list[dict])
async def list_accounts(request: Request):
    """List all accounts with usage stats."""
    rotator = request.app.state.account_rotator
    return rotator.get_all_status()


@accounts_router.post("/{account_id}/reset-limit")
async def reset_limit(request: Request, account_id: str):
    """Manually reset rate limit for an account."""
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_rate_limited = False
    account.rate_limit_until = 0
    return {"status": "reset", "account_id": account_id}


@accounts_router.get("/{account_id}/auth-status", response_model=AuthStatusResponse)
async def get_auth_status(request: Request, account_id: str):
    """Check authentication status for an account."""
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from datetime import datetime
    return AuthStatusResponse(
        account_id=account_id,
        status=account.auth_status,
        last_checked=datetime.now(),
        config_dir=account.config_dir,
        needs_reauth=(account.auth_status == AuthStatus.NEEDS_AUTH),
        error_message=getattr(account, "auth_error", None)
    )


@accounts_router.post("/{account_id}/authenticate", response_model=AuthInitiateResponse)
async def start_authentication(request: Request, account_id: str):
    """Start the authentication process for an account."""
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Update status to authenticating
    account.auth_status = AuthStatus.AUTHENTICATING

    return AuthInitiateResponse(
        account_id=account_id,
        status="initiated",
        message="Interactive authentication started. Follow the prompts on the terminal.",
        instructions="A WebSocket connection will stream the Claude login process. "
                     "Respond to any prompts and confirm the device when asked."
    )


@accounts_router.post("/{account_id}/auth-confirm")
async def confirm_authentication(request: Request, account_id: str):
    """Confirm that authentication for an account has completed successfully."""
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Update account status to authenticated
    account.auth_status = AuthStatus.AUTHENTICATED
    account.is_rate_limited = False  # Clear rate limit on successful auth

    from datetime import datetime
    return {
        "account_id": account_id,
        "status": "authenticated",
        "timestamp": datetime.now().isoformat(),
    }