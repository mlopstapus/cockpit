"""Jobs API — list, detail, control."""
from fastapi import APIRouter, HTTPException, Request
from models import JobSummary, Job, AccountInfo, AuthStatus, AuthInitiateResponse, AuthStatusResponse
from datetime import datetime

router = APIRouter(prefix="/api", tags=["jobs"])


# ── Jobs ───────────────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=list[JobSummary])
async def list_jobs(request: Request):
    """Active jobs first, then recent history."""
    store = request.app.state.job_store
    active = await store.list_active()
    recent = await store.list_recent(limit=20)

    # Merge, deduplicate, active jobs first
    seen = {j.id for j in active}
    combined = active + [j for j in recent if j.id not in seen]
    return [_to_summary(j) for j in combined]


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(request: Request, job_id: str):
    store = request.app.state.job_store
    job = await store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(request: Request, job_id: str):
    runner = request.app.state.pipeline_runner
    await runner.cancel_job(job_id)
    return {"status": "cancelled", "job_id": job_id}


@router.post("/jobs/{job_id}/pause")
async def pause_job(request: Request, job_id: str):
    store = request.app.state.job_store
    job = await store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from models import JobStatus
    await store.update(job_id, status=JobStatus.PAUSED)
    return {"status": "paused", "job_id": job_id}


@router.post("/jobs/{job_id}/resume")
async def resume_job(request: Request, job_id: str):
    store = request.app.state.job_store
    job = await store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from models import JobStatus
    await store.update(job_id, status=JobStatus.RUNNING)
    return {"status": "resumed", "job_id": job_id}


@router.get("/jobs/{job_id}/logs")
async def get_logs(request: Request, job_id: str, n: int = 200):
    store = request.app.state.job_store
    job = await store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    lines = await store.get_log_tail(job_id, n)
    return {"job_id": job_id, "lines": lines}


# ── Accounts ───────────────────────────────────────────────────────────────────

@router.get("/accounts", response_model=list[dict])
async def list_accounts(request: Request):
    rotator = request.app.state.account_rotator
    return rotator.get_all_status()


@router.post("/accounts/{account_id}/reset-limit")
async def reset_limit(request: Request, account_id: str):
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_rate_limited = False
    account.rate_limit_until = 0
    return {"status": "reset", "account_id": account_id}


@router.get("/accounts/{account_id}/auth-status", response_model=AuthStatusResponse)
async def get_auth_status(request: Request, account_id: str):
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AuthStatusResponse(
        account_id=account_id,
        status=getattr(account, "auth_status", AuthStatus.AUTHENTICATED),
        last_checked=datetime.now(),
        config_dir=account.config_dir,
        needs_reauth=getattr(account, "auth_status", AuthStatus.AUTHENTICATED) == AuthStatus.NEEDS_AUTH,
    )


@router.post("/accounts/{account_id}/authenticate", response_model=AuthInitiateResponse)
async def start_authentication(request: Request, account_id: str):
    rotator = request.app.state.account_rotator
    account = rotator.accounts.get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return AuthInitiateResponse(
        account_id=account_id,
        status="initiated",
        message="Connect via WS /ws/accounts/{account_id}/auth-stream to complete login.",
        instructions="Respond to prompts and confirm the device when asked.",
    )


# ── Health ─────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health(request: Request):
    store = request.app.state.job_store
    rotator = request.app.state.account_rotator
    active = await store.list_active()
    return {
        "status": "ok",
        "active_jobs": len(active),
        "accounts": rotator.get_all_status(),
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _to_summary(job: Job) -> JobSummary:
    return JobSummary(
        id=job.id,
        github_repo=job.github_repo,
        pr_number=job.pr_number,
        pr_title=job.pr_title,
        spec_name=job.spec_name,
        stage=job.stage,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        pr_url=job.pr_url,
    )
