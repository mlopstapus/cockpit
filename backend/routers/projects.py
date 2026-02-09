"""Project management API routes."""
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request

from models import (
    CreateProjectRequest,
    UpdateProjectRequest,
    ProjectInfo,
    SessionInfo,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def get_project_store(request: Request) -> dict:
    """Get the in-memory project store from app state."""
    if not hasattr(request.app.state, "projects"):
        request.app.state.projects = {}
    return request.app.state.projects


def _to_project_info(project: dict, sessions: dict) -> ProjectInfo:
    """Convert stored project dict to ProjectInfo response."""
    session_count = sum(
        1 for s in sessions.values()
        if s.get("project_id") == project["id"]
    )
    return ProjectInfo(
        id=project["id"],
        name=project["name"],
        description=project.get("description", ""),
        repo_path=project["repo_path"],
        color=project.get("color", "#3b82f6"),
        icon=project.get("icon", "folder"),
        created_at=project["created_at"],
        updated_at=project["updated_at"],
        session_count=session_count,
    )


@router.get("", response_model=list[ProjectInfo])
async def list_projects(request: Request):
    projects = get_project_store(request)
    sm = request.app.state.session_manager
    return [
        _to_project_info(p, sm.sessions)
        for p in sorted(projects.values(), key=lambda p: p["created_at"], reverse=True)
    ]


@router.post("", response_model=ProjectInfo)
async def create_project(request: Request, body: CreateProjectRequest):
    projects = get_project_store(request)
    sm = request.app.state.session_manager

    project_id = str(uuid.uuid4())[:8]
    now = datetime.now()

    project = {
        "id": project_id,
        "name": body.name,
        "description": body.description or "",
        "repo_path": body.repo_path,
        "color": body.color or "#3b82f6",
        "icon": body.icon or "folder",
        "created_at": now,
        "updated_at": now,
    }
    projects[project_id] = project
    return _to_project_info(project, sm.sessions)


@router.get("/{project_id}", response_model=ProjectInfo)
async def get_project(request: Request, project_id: str):
    projects = get_project_store(request)
    sm = request.app.state.session_manager

    project = projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_project_info(project, sm.sessions)


@router.put("/{project_id}", response_model=ProjectInfo)
async def update_project(request: Request, project_id: str, body: UpdateProjectRequest):
    projects = get_project_store(request)
    sm = request.app.state.session_manager

    project = projects.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.name is not None:
        project["name"] = body.name
    if body.description is not None:
        project["description"] = body.description
    if body.repo_path is not None:
        project["repo_path"] = body.repo_path
    if body.color is not None:
        project["color"] = body.color
    if body.icon is not None:
        project["icon"] = body.icon
    project["updated_at"] = datetime.now()

    return _to_project_info(project, sm.sessions)


@router.delete("/{project_id}")
async def delete_project(request: Request, project_id: str):
    projects = get_project_store(request)
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    del projects[project_id]
    return {"status": "deleted"}


@router.get("/{project_id}/sessions", response_model=list[SessionInfo])
async def get_project_sessions(request: Request, project_id: str):
    projects = get_project_store(request)
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    sm = request.app.state.session_manager
    return [
        sm._to_session_info(sid)
        for sid, s in sm.sessions.items()
        if s.get("project_id") == project_id
    ]
