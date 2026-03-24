"""Tests for SQLite-backed JobStore."""
import pytest
import pytest_asyncio
from datetime import datetime

from models import ActivePR, Job, JobStage, JobStatus, PRReviewJob
from services.job_store import JobStore


def _make_job(**kwargs) -> Job:
    defaults = dict(
        id="test1234",
        repo_path="/repos/my-project",
        github_repo="your-org/your-repo",
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


@pytest_asyncio.fixture
async def store():
    s = JobStore()
    await s._init_db(":memory:")
    yield s
    await s.close()


@pytest.mark.asyncio
async def test_enqueue_dequeue_roundtrip(store):
    """Enqueue a job then dequeue it returns the same job."""
    job = _make_job()
    job_id = await store.enqueue(job)
    assert job_id == job.id

    dequeued = await store.dequeue()
    assert dequeued is not None
    assert dequeued.id == job.id
    assert dequeued.spec_name == "add auth flow"


@pytest.mark.asyncio
async def test_enqueue_deduplicates_same_issue(store):
    """Second enqueue for same issue returns existing job id."""
    job = _make_job()
    id1 = await store.enqueue(job)

    job2 = _make_job(id="other999")
    id2 = await store.enqueue(job2)

    assert id1 == id2  # same issue → same job


@pytest.mark.asyncio
async def test_fifo_dequeue_order(store):
    """Jobs dequeue in creation order (FIFO)."""
    import asyncio
    job_a = _make_job(id="aaaa0001", issue_number=1, created_at=datetime(2025, 1, 1, 0, 0, 0))
    job_b = _make_job(id="bbbb0002", issue_number=2, created_at=datetime(2025, 1, 1, 0, 0, 1))
    await store.enqueue(job_a)
    await store.enqueue(job_b)

    first = await store.dequeue()
    second = await store.dequeue()
    assert first.id == "aaaa0001"
    assert second.id == "bbbb0002"


@pytest.mark.asyncio
async def test_dequeue_returns_none_when_empty(store):
    result = await store.dequeue()
    assert result is None


@pytest.mark.asyncio
async def test_append_and_get_log_tail(store):
    """Log lines are stored and retrievable."""
    job = _make_job()
    await store.enqueue(job)

    await store.append_log(job.id, "line one")
    await store.append_log(job.id, "line two")
    await store.append_log(job.id, "line three")

    tail = await store.get_log_tail(job.id, 2)
    assert tail == ["line two", "line three"]


@pytest.mark.asyncio
async def test_append_log_trims_to_buffer(store):
    """Log buffer trims to 1000 lines."""
    job = _make_job()
    await store.enqueue(job)

    for i in range(1050):
        await store.append_log(job.id, f"line {i}")

    tail = await store.get_log_tail(job.id, 9999)
    assert len(tail) <= 1000


@pytest.mark.asyncio
async def test_mark_complete(store):
    job = _make_job()
    await store.enqueue(job)
    await store.mark_active(job.id)
    await store.mark_complete(job.id)

    updated = await store.get(job.id)
    assert updated.status == JobStatus.COMPLETED
    assert updated.stage == JobStage.DONE


@pytest.mark.asyncio
async def test_mark_failed(store):
    job = _make_job()
    await store.enqueue(job)
    await store.mark_failed(job.id, "PTY exited with code 1")

    updated = await store.get(job.id)
    assert updated.status == JobStatus.FAILED
    assert "PTY" in updated.error


@pytest.mark.asyncio
async def test_mark_cancelled(store):
    job = _make_job()
    await store.enqueue(job)
    await store.mark_cancelled(job.id)

    updated = await store.get(job.id)
    assert updated.status == JobStatus.CANCELLED


@pytest.mark.asyncio
async def test_comment_seen_dedup(store):
    job = _make_job()
    await store.enqueue(job)

    assert not await store.is_comment_seen(job.id, 999)
    await store.mark_comment_seen(job.id, 999)
    assert await store.is_comment_seen(job.id, 999)


@pytest.mark.asyncio
async def test_register_list_deregister_pr(store):
    job = _make_job()
    await store.enqueue(job)

    pr = ActivePR(
        job_id=job.id,
        github_repo="your-org/your-repo",
        pr_number=7,
        issue_number=42,
        repo_path="/repos/my-project",
        registered_at=datetime.utcnow(),
    )
    await store.register_active_pr(pr)

    prs = await store.list_active_prs()
    assert len(prs) == 1
    assert prs[0].pr_number == 7

    fetched = await store.get_active_pr("your-org/your-repo", 7)
    assert fetched is not None
    assert fetched.job_id == job.id

    await store.deregister_pr("your-org/your-repo", 7)
    prs_after = await store.list_active_prs()
    assert len(prs_after) == 0


@pytest.mark.asyncio
async def test_pr_comment_seen_dedup(store):
    assert not await store.is_pr_comment_seen("your-org/your-repo", 7, "cmt_abc")
    await store.mark_pr_comment_seen("your-org/your-repo", 7, "cmt_abc")
    assert await store.is_pr_comment_seen("your-org/your-repo", 7, "cmt_abc")


@pytest.mark.asyncio
async def test_enqueue_dequeue_pr_review(store):
    review = PRReviewJob(
        id="rev00001",
        github_repo="your-org/your-repo",
        pr_number=7,
        issue_number=42,
        repo_path="/repos/my-project",
        comment_id="cmt_xyz",
        comment_body="LGTM",
        pr_url="https://github.com/your-org/your-repo/pull/7",
        created_at=datetime.utcnow(),
    )
    await store.enqueue_pr_review(review)

    dequeued = await store.dequeue_pr_review()
    assert dequeued is not None
    assert dequeued.id == "rev00001"
    assert dequeued.comment_body == "LGTM"


@pytest.mark.asyncio
async def test_list_active(store):
    job = _make_job()
    await store.enqueue(job)
    await store.mark_active(job.id)

    active = await store.list_active()
    assert any(j.id == job.id for j in active)


@pytest.mark.asyncio
async def test_list_recent(store):
    job = _make_job()
    await store.enqueue(job)

    recent = await store.list_recent()
    assert any(j.id == job.id for j in recent)


def test_make_job_strips_cockpit_prefix():
    job = JobStore.make_job(
        github_repo="your-org/your-repo",
        issue_number=1,
        issue_title="[COCKPIT] add user auth",
        issue_body="body",
        repo_path="/repos/my-project",
    )
    assert job.spec_name == "add user auth"
    assert job.issue_title == "[COCKPIT] add user auth"
