"""Configuration for Claude Cockpit."""
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import BaseModel


class AccountConfig(BaseModel):
    id: str
    name: str
    config_dir: str  # Path to ~/.claude-profiles/<account>
    tier: str = "pro"  # "pro" or "max"
    priority: int = 1  # Lower = preferred
    daily_message_estimate: int = 100


class RepoConfig(BaseModel):
    name: str
    path: str
    description: str = ""
    default_branch: str = "main"
    docker_compose: bool = False  # Has docker-compose.yml?


class Settings(BaseSettings):
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Database - SQLite for MVP (can be switched to PostgreSQL for production)
    # Use DATABASE_URL env var to override (e.g., "postgresql+asyncpg://user:pass@host/db")
    database_url: str = "sqlite+aiosqlite:///./cockpit.db"

    # Claude profiles directory
    profiles_dir: str = "~/.claude-profiles"

    # Repos - DEPRECATED: Use dynamic workspace discovery instead (GET /api/workspaces/discover)
    # Kept for backward compatibility and auto-migration on first startup
    repos: list[RepoConfig] = [
        # RepoConfig(
        #     name="example",
        #     path="~/repos/example",
        #     description="Example repository",
        #     docker_compose=False,
        # ),
    ]

    # Accounts - configure with your Claude subscription profiles
    accounts: list[AccountConfig] = [
        AccountConfig(
            id="primary",
            name="Claude Pro - Primary",
            config_dir="~/.claude-profiles/primary",
            tier="pro",
            priority=1,
            daily_message_estimate=100,
        ),
        AccountConfig(
            id="secondary",
            name="Claude Pro - Secondary",
            config_dir="~/.claude-profiles/secondary",
            tier="pro",
            priority=2,
            daily_message_estimate=100,
        ),
    ]

    # Session defaults
    max_concurrent_sessions: int = 5
    session_timeout_minutes: int = 60

    # Repos root — directory to scan for workspace discovery
    # The /api/workspaces/discover endpoint will scan this directory for git repositories
    # Defaults to ~/repos, but can be customized via BROWSE_ROOT env var
    browse_root: str = "~/repos"

    def get_profiles_dir(self) -> Path:
        return Path(self.profiles_dir).expanduser()


settings = Settings()
