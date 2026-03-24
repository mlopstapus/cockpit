"""Tests for GithubWatcher."""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch


def _issue(title: str = "[COCKPIT] add auth", login: str = "test-owner", number: int = 1, state: str = "open"):
    return {
        "number": number,
        "title": title,
        "state": state,
        "body": "Feature description",
        "user": {"login": login},
        # No "pull_request" key — this is a plain issue
    }


@pytest_asyncio.fixture
async def store():
    from services.job_store import JobStore
    s = JobStore()
    await s._init_db(":memory:")
    yield s
    await s.close()


@pytest.mark.asyncio
async def test_cockpit_prefix_issue_enqueued(store, monkeypatch):
    """[COCKPIT] issue from owner → job enqueued."""
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "test-owner")
    monkeypatch.setattr(config.settings, "github_repos", ["test-owner/my-repo"])

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_issue()])
    )

    from pathlib import Path
    with patch.object(config.Settings, "get_local_path", lambda self, repo: Path("/tmp")):
        await watcher._poll_once()

    job = await store.dequeue()
    assert job is not None
    assert job.spec_name == "add auth"
    assert job.issue_number == 1


@pytest.mark.asyncio
async def test_non_cockpit_prefix_ignored(store, monkeypatch):
    """Issue without [COCKPIT] prefix is not enqueued."""
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "test-owner")
    monkeypatch.setattr(config.settings, "github_repos", ["test-owner/my-repo"])

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_issue(title="add auth")])
    )

    await watcher._poll_once()
    job = await store.dequeue()
    assert job is None


@pytest.mark.asyncio
async def test_wrong_owner_ignored(store, monkeypatch):
    """Issue from non-owner is not enqueued."""
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "test-owner")
    monkeypatch.setattr(config.settings, "github_repos", ["test-owner/my-repo"])

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [_issue(login="otherperson")])
    )

    await watcher._poll_once()
    job = await store.dequeue()
    assert job is None


@pytest.mark.asyncio
async def test_pull_requests_skipped(store, monkeypatch):
    """Items with pull_request key are skipped even if title matches."""
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "test-owner")
    monkeypatch.setattr(config.settings, "github_repos", ["test-owner/my-repo"])

    pr_item = {**_issue(), "pull_request": {"url": "https://api.github.com/..."}}

    watcher = GithubWatcher(store)
    watcher._client = AsyncMock()
    watcher._client.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [pr_item])
    )

    await watcher._poll_once()
    job = await store.dequeue()
    assert job is None


@pytest.mark.asyncio
async def test_already_queued_issue_skipped(store, monkeypatch):
    """Second poll for same issue does not create a duplicate job."""
    from services.github_watcher import GithubWatcher
    import config

    monkeypatch.setattr(config.settings, "github_token", "tok")
    monkeypatch.setattr(config.settings, "github_owner", "test-owner")
    monkeypatch.setattr(config.settings, "github_repos", ["test-owner/my-repo"])

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
    j1 = await store.dequeue()
    # Mark it so second dequeue doesn't find it
    if j1:
        await store.mark_active(j1.id)
    j2 = await store.dequeue()
    assert j1 is not None
    assert j2 is None
