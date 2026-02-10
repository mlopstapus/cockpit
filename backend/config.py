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

    # Database (PostgreSQL via Docker Compose)
    database_url: str = "postgresql://cockpit:cockpit-dev-password@localhost:5432/cockpit"

    # Claude profiles directory
    profiles_dir: str = "~/.claude-profiles"

    # Repos - configure these for your setup
    repos: list[RepoConfig] = [
        RepoConfig(
            name="opero",
            path="~/repos/opero",
            description="Dental practice CRM with AI patient communication",
            docker_compose=True,
        ),
        RepoConfig(
            name="laddr",
            path="~/repos/laddr",
            description="WordLaddr word game",
        ),
        RepoConfig(
            name="smartr",
            path="~/repos/smartr",
            description="Smartr project",
        ),
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

    # Browse root — the host path mounted into the container for folder browsing
    # In Docker: /projects (user's home mounted via PROJECTS_PATH). Locally: ~.
    browse_root: str = "/projects"

    def get_profiles_dir(self) -> Path:
        return Path(self.profiles_dir).expanduser()


settings = Settings()
