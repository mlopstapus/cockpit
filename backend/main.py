"""Claude Cockpit — Main FastAPI Application."""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from config import settings
from models import AuthStatus
from services.account_rotator import AccountRotator
from services.session_manager import SessionManager
from services.auth_process import AuthProcess
from ws.hub import WebSocketHub
from routers.sessions import router as sessions_router
from routers.repos import repos_router, accounts_router
from routers.projects import router as projects_router
from routers.workspaces import router as workspaces_router
from db import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _auto_migrate_projects(app: FastAPI):
    """Auto-discover workspaces and create projects on first startup."""
    from pathlib import Path
    import uuid
    from datetime import datetime

    repos_root = Path(settings.browse_root).expanduser().resolve()

    # If browse_root doesn't exist, skip migration
    if not repos_root.exists() or not repos_root.is_dir():
        logger.warning(f"Repos root not found, skipping auto-migration: {repos_root}")
        return

    logger.info(f"Auto-discovering workspaces in: {repos_root}")

    discovered_count = 0
    for entry in sorted(repos_root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        # Only create projects for git repositories
        if not (entry / ".git").exists():
            continue

        # Create project
        project_id = str(uuid.uuid4())[:8]
        now = datetime.now()

        app.state.projects[project_id] = {
            "id": project_id,
            "name": entry.name,
            "description": f"Auto-discovered from {repos_root}",
            "repo_path": str(entry),
            "color": _get_project_color(discovered_count),
            "icon": "folder",
            "created_at": now,
            "updated_at": now,
        }

        discovered_count += 1
        logger.info(f"   ✓ Created project: {entry.name}")

    if discovered_count > 0:
        logger.info(f"Auto-migrated {discovered_count} project(s) from workspace discovery")


def _get_project_color(index: int) -> str:
    """Get a color for a project based on its index."""
    colors = [
        "#ef4444", "#f97316", "#eab308", "#22c55e",
        "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
    ]
    return colors[index % len(colors)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    # Initialize database
    logger.info("Initializing database...")
    await init_db()
    logger.info("✓ Database initialized")

    # Initialize services
    account_rotator = AccountRotator()
    session_manager = SessionManager(account_rotator)
    ws_hub = WebSocketHub()

    # Store in app state for access from routes
    app.state.account_rotator = account_rotator
    app.state.session_manager = session_manager
    app.state.ws_hub = ws_hub
    app.state.projects = {}  # In-memory project store (TODO: migrate to DB fully)

    # Auto-discover and create projects on first startup
    if not app.state.projects:
        await _auto_migrate_projects(app)

    logger.info("🚀 Claude Cockpit started")
    logger.info(f"   Accounts: {[a.id for a in settings.accounts]}")
    logger.info(f"   Projects: {len(app.state.projects)}")

    yield

    # Shutdown — stop all sessions
    logger.info("Shutting down...")
    for session_id in list(session_manager.sessions.keys()):
        try:
            await session_manager.stop_session(session_id)
        except Exception as e:
            logger.error(f"Error stopping session {session_id}: {e}")


app = FastAPI(
    title="Claude Cockpit",
    description="Manage multiple Claude Code agent sessions from your phone",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server and PWA
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tailscale handles auth; wide open is fine
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(sessions_router)
app.include_router(repos_router)
app.include_router(accounts_router)
app.include_router(projects_router)
app.include_router(workspaces_router)


# WebSocket endpoint for session streaming
@app.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str):
    """Stream Claude Code output for a session."""
    ws_hub: WebSocketHub = websocket.app.state.ws_hub
    sm: SessionManager = websocket.app.state.session_manager

    # Verify session exists
    session = sm.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    await ws_hub.connect(session_id, websocket)

    try:
        # Keep connection alive, handle incoming messages
        while True:
            data = await websocket.receive_json()

            # Client can send messages through WebSocket too
            if data.get("type") == "message":
                await sm.send_message(session_id, data["content"])

    except WebSocketDisconnect:
        ws_hub.disconnect(session_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        ws_hub.disconnect(session_id, websocket)


# WebSocket endpoint for account authentication streaming
@app.websocket("/ws/accounts/{account_id}/auth-stream")
async def account_auth_websocket(websocket: WebSocket, account_id: str):
    """Stream interactive Claude login process for account re-authentication."""
    ar: AccountRotator = websocket.app.state.account_rotator

    # Verify account exists
    account = ar.accounts.get(account_id)
    if not account:
        await websocket.close(code=4004, reason="Account not found")
        return

    await websocket.accept()

    # Spawn auth process
    auth_proc = AuthProcess(account_id, str(account.config_dir))

    try:
        await auth_proc.start()
        output_queue = auth_proc.subscribe()

        # Task to stream output to WebSocket
        async def stream_auth_output():
            while True:
                chunk = await output_queue.get()
                if chunk is None:
                    # Auth process completed
                    await websocket.send_json({
                        "type": "status",
                        "status": "authenticated",
                        "account_id": account_id,
                    })
                    break

                await websocket.send_json({
                    "type": "output",
                    "content": chunk,
                    "account_id": account_id,
                })

        # Task to handle incoming messages (user input)
        async def handle_auth_input():
            while True:
                try:
                    data = await websocket.receive_json()
                    if data.get("type") == "input":
                        await auth_proc.send_input(data["content"])
                except WebSocketDisconnect:
                    break

        # Run both tasks concurrently
        output_task = asyncio.create_task(stream_auth_output())
        input_task = asyncio.create_task(handle_auth_input())

        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [output_task, input_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except WebSocketDisconnect:
        logger.info(f"Auth WebSocket disconnected for account {account_id}")
    except Exception as e:
        logger.error(f"Auth WebSocket error for account {account_id}: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
                "account_id": account_id,
            })
        except:
            pass
    finally:
        auth_proc.stop()
        # Update account status back to needs_auth if not authenticated
        if auth_proc.is_running:
            account.auth_status = AuthStatus.NEEDS_AUTH


# Health check
@app.get("/api/health")
async def health():
    sm = app.state.session_manager
    ar = app.state.account_rotator
    return {
        "status": "ok",
        "active_sessions": len([
            s for s in sm.sessions.values()
            if s["status"].value == "running"
        ]),
        "total_sessions": len(sm.sessions),
        "accounts": ar.get_all_status(),
    }


# Serve frontend static files in production
# Uncomment when frontend is built:
# frontend_path = Path(__file__).parent.parent / "frontend" / "dist"
# if frontend_path.exists():
#     app.mount("/", StaticFiles(directory=str(frontend_path), html=True))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
