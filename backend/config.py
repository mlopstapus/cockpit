"""Configuration for Claude Cockpit."""
import json
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import BaseModel, field_validator


class AccountConfig(BaseModel):
    id: str
    name: str
    config_dir: str  # Path to ~/.claude-profiles/<account>
    tier: str = "pro"
    priority: int = 1
    daily_message_estimate: int = 100


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_list_separator=",")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379"

    # GitHub
    github_token: str = ""
    github_owner: str = "mlopstapus"
    github_repos: list[str] = ["mlopstapus/seamless"]
    github_poll_interval: int = 30  # seconds

    # Maps "owner/repo" -> local path on NUC, JSON-encoded string or default
    # e.g. '{"mlopstapus/seamless": "/home/ben/repos/seamless"}'
    repo_local_paths: dict[str, str] = {}

    # Claude profiles
    profiles_dir: str = "~/.claude-profiles"

    # Accounts
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

    # Pipeline timeouts
    stage_timeout_minutes: int = 30
    clarify_timeout_hours: int = 24

    # PR comments toggle (disable for dev/testing)
    pr_comments_enabled: bool = True

    @field_validator("github_repos", mode="before")
    @classmethod
    def parse_repos(cls, v):
        if isinstance(v, str):
            return [r.strip() for r in v.split(",") if r.strip()]
        return v

    @field_validator("repo_local_paths", mode="before")
    @classmethod
    def parse_local_paths(cls, v):
        if isinstance(v, str):
            if not v:
                return {}
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v

    def get_profiles_dir(self) -> Path:
        return Path(self.profiles_dir).expanduser()

    def get_local_path(self, github_repo: str) -> Path | None:
        """Resolve the local filesystem path for a given owner/repo slug."""
        raw = self.repo_local_paths.get(github_repo)
        if raw:
            return Path(raw).expanduser().resolve()
        # Fallback: ~/repos/<repo-name>
        repo_name = github_repo.split("/")[-1]
        fallback = Path("~/repos").expanduser() / repo_name
        if fallback.exists():
            return fallback
        return None


settings = Settings()
