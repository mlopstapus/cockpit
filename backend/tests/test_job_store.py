"""Tests for Redis-backed JobStore."""
import pytest
import pytest_asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from models import Job, JobStage, JobStatus


def _make_job(**kwargs) -> Job:
    defaults = dict(
        id="test1234",
        repo_path="/repos/seamless",
        github_repo="mlopstapus/seamless",
        issue_number=42,
        issue_title="[COCKPIT] add auth flow",
        issue_body="Add user authentication",
        spec_name="add auth flow",
        stage=JobStage.IDLE,
        status=JobStatus.QUEUED,
        account_id="primary",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return Job(**defaults)


@pytest.mark.asyncio
async def test_enqueue_dequeue_roundtrip():
    """Enqueue a job then dequeue it returns the same job."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    job_id = await store.enqueue(job)
    assert job_id == job.id

    dequeued = await store.dequeue(timeout=1)
    assert dequeued is not None
    assert dequeued.id == job.id
    assert dequeued.spec_name == "add auth flow"


@pytest.mark.asyncio
async def test_enqueue_deduplicates_same_issue():
    """Second enqueue for same issue returns existing job id."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    id1 = await store.enqueue(job)

    job2 = _make_job(id="other999")
    id2 = await store.enqueue(job2)

    assert id1 == id2  # same issue → same job


@pytest.mark.asyncio
async def test_append_and_get_log_tail():
    """Log lines are stored and retrievable."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    await store.enqueue(job)

    await store.append_log(job.id, "line one")
    await store.append_log(job.id, "line two")
    await store.append_log(job.id, "line three")

    tail = await store.get_log_tail(job.id, 2)
    assert tail == ["line two", "line three"]


@pytest.mark.asyncio
async def test_mark_complete():
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    await store.enqueue(job)
    await store.mark_active(job.id)
    await store.mark_complete(job.id)

    updated = await store.get(job.id)
    assert updated.status == JobStatus.COMPLETED
    assert updated.stage == JobStage.DONE


@pytest.mark.asyncio
async def test_mark_failed():
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    await store.enqueue(job)
    await store.mark_failed(job.id, "PTY exited with code 1")

    updated = await store.get(job.id)
    assert updated.status == JobStatus.FAILED
    assert "PTY" in updated.error


@pytest.mark.asyncio
async def test_comment_seen_dedup():
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    job = _make_job()
    await store.enqueue(job)

    assert not await store.is_comment_seen(job.id, 999)
    await store.mark_comment_seen(job.id, 999)
    assert await store.is_comment_seen(job.id, 999)


def test_make_job_strips_cockpit_prefix():
    from services.job_store import JobStore
    job = JobStore.make_job(
        github_repo="mlopstapus/seamless",
        issue_number=1,
        issue_title="[COCKPIT] add user auth",
        issue_body="body",
        repo_path="/repos/seamless",
    )
    assert job.spec_name == "add user auth"
    assert job.issue_title == "[COCKPIT] add user auth"
