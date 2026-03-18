"""Tests for GithubWatcher."""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx


def _pr(title: str = "[COCKPIT] add auth", login: str = "mlopstapus", number: int = 1, state: str = "open"):
    return {
        "number": number,
        "title": title,
        "state": state,
        "body": "Feature description",
        "head": {"ref": "cockpit/add-auth"},
        "user": {"login": login},
    }


@pytest.mark.asyncio
async def test_cockpit_prefix_pr_enqueued(monkeypatch):
    """[COCKPIT] PR from owner → job enqueued."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "mlopstapus")
    monkeypatch.setattr(config.settings, "github_repos", ["mlopstapus/seamless"])

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_pr()])
    )

    from pathlib import Path
    import config
    # Patch the class method (avoids Pydantic instance-field restrictions)
    with patch.object(config.Settings, "get_local_path", lambda self, repo: Path("/tmp")):
        await watcher._poll_once()

    # Should have enqueued one job
    job = await store.dequeue(timeout=1)
    assert job is not None
    assert job.spec_name == "add auth"
    assert job.pr_number == 1


@pytest.mark.asyncio
async def test_non_cockpit_prefix_ignored(monkeypatch):
    """PR without [COCKPIT] prefix is not enqueued."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "mlopstapus")
    monkeypatch.setattr(config.settings, "github_repos", ["mlopstapus/seamless"])

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_pr(title="add auth")])
    )

    await watcher._poll_once()
    job = await store.dequeue(timeout=1)
    assert job is None


@pytest.mark.asyncio
async def test_wrong_owner_ignored(monkeypatch):
    """PR from non-owner is not enqueued."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "mlopstapus")
    monkeypatch.setattr(config.settings, "github_repos", ["mlopstapus/seamless"])

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_pr(login="otherperson")])
    )

    await watcher._poll_once()
    job = await store.dequeue(timeout=1)
    assert job is None


@pytest.mark.asyncio
async def test_already_queued_pr_skipped(monkeypatch):
    """Second poll for same PR does not create a duplicate job."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "mlopstapus")
    monkeypatch.setattr(config.settings, "github_repos", ["mlopstapus/seamless"])

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_pr()])
    )

    from pathlib import Path
    import config
    with patch.object(config.Settings, "get_local_path", lambda self, repo: Path("/tmp")):
        await watcher._poll_once()
        await watcher._poll_once()

    # Only one job in queue
    j1 = await store.dequeue(timeout=1)
    j2 = await store.dequeue(timeout=1)
    assert j1 is not None
    assert j2 is None
