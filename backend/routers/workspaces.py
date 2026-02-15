"""Workspace discovery API routes."""
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import settings

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceInfo(BaseModel):
    """Metadata about a discovered workspace/repository."""
    name: str
    path: str
    is_git_repo: bool
    default_branch: str | None = None
    has_docker_compose: bool = False


@router.get("/discover", response_model=list[WorkspaceInfo])
async def discover_workspaces():
    """Discover git repositories in the configured repos root directory.

    Scans the browse_root directory for subdirectories that are git repositories.
    Returns metadata for each discovered repo to enable workspace selection.
    """
    try:
        repos_root = Path(settings.browse_root).expanduser().resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid repos_root path")

    if not repos_root.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Repos root directory not found: {repos_root}"
        )

    if not repos_root.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Repos root path is not a directory: {repos_root}"
        )

    workspaces = []

    try:
        # Scan all subdirectories in repos_root
        for entry in sorted(repos_root.iterdir()):
            if not entry.is_dir():
                continue

            # Skip hidden directories
            if entry.name.startswith("."):
                continue

            # Check if it's a git repository
            is_git = (entry / ".git").exists()

            # Detect default branch (only if git repo)
            default_branch = None
            if is_git:
                default_branch = _get_default_branch(entry)

            # Check for docker-compose.yml
            has_docker_compose = (
                (entry / "docker-compose.yml").exists() or
                (entry / "docker-compose.yaml").exists()
            )

            workspaces.append(WorkspaceInfo(
                name=entry.name,
                path=str(entry),
                is_git_repo=is_git,
                default_branch=default_branch,
                has_docker_compose=has_docker_compose,
            ))

    except PermissionError:
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied reading: {repos_root}"
        )

    return workspaces


def _get_default_branch(repo_path: Path) -> str | None:
    """Detect the default branch for a git repository.

    Tries multiple methods:
    1. Check remote HEAD (git symbolic-ref refs/remotes/origin/HEAD)
    2. Check local HEAD (git symbolic-ref HEAD)
    3. Fallback to "main" or "master" if those branches exist
    """
    try:
        # Method 1: Check remote origin/HEAD
        result = subprocess.run(
            ["git", "-C", str(repo_path), "symbolic-ref", "refs/remotes/origin/HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            # Output: refs/remotes/origin/main
            branch = result.stdout.strip().split("/")[-1]
            return branch
    except (subprocess.SubprocessError, FileNotFoundError):
        pass

    try:
        # Method 2: Check local HEAD
        result = subprocess.run(
            ["git", "-C", str(repo_path), "symbolic-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            # Output: refs/heads/main
            branch = result.stdout.strip().split("/")[-1]
            return branch
    except (subprocess.SubprocessError, FileNotFoundError):
        pass

    # Method 3: Check if main or master branches exist
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_path), "branch", "--list"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            branches = [b.strip().lstrip("* ") for b in result.stdout.split("\n") if b.strip()]
            if "main" in branches:
                return "main"
            if "master" in branches:
                return "master"
    except (subprocess.SubprocessError, FileNotFoundError):
        pass

    # Fallback
    return "main"
