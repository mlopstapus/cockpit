"""Session management API routes."""
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from models import (
    CreateSessionRequest,
    SendMessageRequest,
    SessionInfo,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# These will be injected from main.py via app.state
# Accessed as: router.session_manager, etc.


def get_deps(request_or_ws):
    """Get dependencies from app state."""
    app = request_or_ws.app
    return app.state.session_manager, app.state.ws_hub


@router.get("", response_model=list[SessionInfo])
async def list_sessions(request: Request):
    sm, _ = get_deps(request)
    return sm.list_sessions()


@router.post("", response_model=SessionInfo)
async def create_session(request: Request, body: CreateSessionRequest):
    sm, ws_hub = get_deps(request)
    projects = request.app.state.projects
    
    # Look up the project
    project = projects.get(body.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        session = await sm.create_session(
            project_id=body.project_id,
            project=project,
            name=body.name,
            account_id=body.account_id,
        )

        # Start streaming output to WebSocket clients
        process = sm.get_process(session.id)
        if process:
            queue = process.subscribe()
            ws_hub.start_streaming(session.id, queue)

        return session
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{session_id}", response_model=SessionInfo)
async def get_session(request: Request, session_id: str):
    sm, _ = get_deps(request)
    session = sm.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return sm._to_session_info(session_id)


@router.post("/{session_id}/send")
async def send_message(request: Request, session_id: str, body: SendMessageRequest):
    sm, _ = get_deps(request)
    try:
        await sm.send_message(session_id, body.content)
        return {"status": "sent"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/{session_id}/oneshot")
async def send_oneshot(request: Request, session_id: str, body: SendMessageRequest):
    """Send a one-shot command and get the full response."""
    sm, _ = get_deps(request)
    try:
        result = await sm.send_oneshot(session_id, body.content)
        return {"result": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{session_id}")
async def stop_session(request: Request, session_id: str):
    sm, ws_hub = get_deps(request)
    try:
        ws_hub.stop_streaming(session_id)
        await sm.stop_session(session_id)
        return {"status": "stopped"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
