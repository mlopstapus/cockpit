"""Tests for GithubWatcher."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _issue(title: str = "[COCKPIT] add auth", login: str = "mlopstapus", number: int = 1, state: str = "open"):
    return {
        "number": number,
        "title": title,
        "state": state,
        "body": "Feature description",
        "user": {"login": login},
        # No "pull_request" key — this is a plain issue
    }


@pytest.mark.asyncio
async def test_cockpit_prefix_issue_enqueued(monkeypatch):
    """[COCKPIT] issue from owner → job enqueued."""
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
        return_value=MagicMock(status_code=200, json=lambda: [_issue()])
    )

    from pathlib import Path
    with patch.object(config.Settings, "get_local_path", lambda self, repo: Path("/tmp")):
        await watcher._poll_once()

    job = await store.dequeue(timeout=1)
    assert job is not None
    assert job.spec_name == "add auth"
    assert job.issue_number == 1


@pytest.mark.asyncio
async def test_non_cockpit_prefix_ignored(monkeypatch):
    """Issue without [COCKPIT] prefix is not enqueued."""
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
        return_value=MagicMock(status_code=200, json=lambda: [_issue(title="add auth")])
    )

    await watcher._poll_once()
    job = await store.dequeue(timeout=1)
    assert job is None


@pytest.mark.asyncio
async def test_wrong_owner_ignored(monkeypatch):
    """Issue from non-owner is not enqueued."""
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
        return_value=MagicMock(status_code=200, json=lambda: [_issue(login="otherperson")])
    )

    await watcher._poll_once()
    job = await store.dequeue(timeout=1)
    assert job is None


@pytest.mark.asyncio
async def test_pull_requests_skipped(monkeypatch):
    """Items with pull_request key are skipped even if title matches."""
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

    pr_item = {**_issue(), "pull_request": {"url": "https://api.github.com/..."}}

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [pr_item])
    )

    await watcher._poll_once()
    job = await store.dequeue(timeout=1)
    assert job is None


@pytest.mark.asyncio
async def test_already_queued_issue_skipped(monkeypatch):
    """Second poll for same issue does not create a duplicate job."""
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
        return_value=MagicMock(status_code=200, json=lambda: [_issue()])
    )

    from pathlib import Path
    with patch.object(config.Settings, "get_local_path", lambda self, repo: Path("/tmp")):
        await watcher._poll_once()
        await watcher._poll_once()

    # Only one job in queue
    j1 = await store.dequeue(timeout=1)
    j2 = await store.dequeue(timeout=1)
    assert j1 is not None
    assert j2 is None
