"""Claude Cockpit — PR-Driven Spec Pipeline."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import AuthStatus
from services.account_rotator import AccountRotator
from services.auth_process import AuthProcess
from services.comment_relay import CommentRelay
from services.github_watcher import GithubWatcher
from services.job_store import JobStore
from services.pipeline_runner import PipelineRunner
from services.pr_commenter import PRCommenter
from services.pr_review_runner import PRReviewRunner
from services.pr_review_watcher import PRReviewWatcher
from ws.hub import WebSocketHub
from routers.jobs import router as jobs_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    logger.info("Starting Claude Cockpit...")

    job_store = JobStore()
    await job_store._init_db(settings.db_path)
    account_rotator = AccountRotator()
    hub = WebSocketHub()
    pr_commenter = PRCommenter()
    comment_relay = CommentRelay(job_store, pr_commenter)
    pipeline_runner = PipelineRunner(
        job_store=job_store,
        hub=hub,
        account_rotator=account_rotator,
        pr_commenter=pr_commenter,
        comment_relay=comment_relay,
    )
    github_watcher = GithubWatcher(job_store)
    pr_review_runner = PRReviewRunner(
        job_store=job_store,
        account_rotator=account_rotator,
        pr_commenter=pr_commenter,
    )
    pr_review_watcher = PRReviewWatcher(job_store, pr_commenter)

    app.state.job_store = job_store
    app.state.account_rotator = account_rotator
    app.state.hub = hub
    app.state.pipeline_runner = pipeline_runner

    await pipeline_runner.start()
    await github_watcher.start()
    await pr_review_runner.start()
    await pr_review_watcher.start()

    logger.info("🚀 Claude Cockpit ready")
    logger.info(f"   Watching repos: {settings.github_repos}")
    logger.info(f"   Accounts: {[a.id for a in settings.accounts]}")
    logger.info(f"   Poll interval: {settings.github_poll_interval}s")

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    logger.info("Shutting down...")
    await pr_review_watcher.stop()
    await pr_review_runner.stop()
    await github_watcher.stop()
    await pipeline_runner.stop()
    await pr_commenter.close()
    await comment_relay.close()
    await job_store.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Claude Cockpit",
    description="PR-driven spec pipeline. Opens a [COCKPIT] PR → spec-kit runs.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tailscale handles network-level access control
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router)


# ── WebSocket: job log stream ──────────────────────────────────────────────────

@app.websocket("/ws/jobs/{job_id}")
async def job_log_stream(websocket: WebSocket, job_id: str):
    """Diagnostic log stream for an active or recent job."""
    store: JobStore = websocket.app.state.job_store
    hub: WebSocketHub = websocket.app.state.hub

    job = await store.get(job_id)
    if not job:
        await websocket.close(code=4004, reason="Job not found")
        return

    await hub.connect(job_id, websocket)

    # Send catch-up buffer
    catch_up = await store.get_log_tail(job_id, 200)
    for line in catch_up:
        try:
            await websocket.send_text(line)
        except Exception:
            break

    try:
        # Keep connection alive; client can disconnect anytime
        while True:
            await asyncio.sleep(30)
            await websocket.send_text("[PING]\n")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.disconnect(job_id, websocket)


# ── WebSocket: account auth stream ────────────────────────────────────────────

@app.websocket("/ws/accounts/{account_id}/auth-stream")
async def account_auth_stream(websocket: WebSocket, account_id: str):
    """Interactive Claude login stream."""
    ar: AccountRotator = websocket.app.state.account_rotator
    account = ar.accounts.get(account_id)
    if not account:
        await websocket.close(code=4004, reason="Account not found")
        return

    await websocket.accept()
    auth_proc = AuthProcess(account_id, str(account.config_dir))

    try:
        await auth_proc.start()
        output_queue = auth_proc.subscribe()

        async def stream_output():
            while True:
                chunk = await output_queue.get()
                if chunk is None:
                    await websocket.send_json({"type": "status", "status": "authenticated"})
                    break
                await websocket.send_json({"type": "output", "content": chunk})

        async def handle_input():
            while True:
                try:
                    data = await websocket.receive_json()
                    if data.get("type") == "input":
                        await auth_proc.send_input(data["content"])
                except WebSocketDisconnect:
                    break

        output_task = asyncio.create_task(stream_output())
        input_task = asyncio.create_task(handle_input())
        done, pending = await asyncio.wait(
            [output_task, input_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Auth stream error for {account_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        auth_proc.stop()
        if auth_proc.is_running:
            account.auth_status = AuthStatus.NEEDS_AUTH


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
