"""Tests for CommentRelay — clarify Q&A and ad hoc steering."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_extract_questions_from_numbered_list():
    """Numbered questions extracted from clarify PTY output."""
    from services.comment_relay import CommentRelay

    text = """
    I need some clarification before proceeding:
    1. What authentication method should be used — OAuth or email/password?
    2. Should the token be stored in a cookie or localStorage?
    3. Is multi-factor authentication required in scope?
    """
    questions = CommentRelay._extract_questions(text)
    assert len(questions) == 3
    assert "authentication method" in questions[0].lower()


def test_extract_questions_empty_output():
    from services.comment_relay import CommentRelay
    questions = CommentRelay._extract_questions("Plan complete. No clarification needed.")
    assert questions == []


def test_sanitise_strips_html():
    from services.comment_relay import CommentRelay
    dirty = "<p>Use <strong>OAuth</strong> for login.</p>"
    clean = CommentRelay._sanitise(dirty)
    assert "<" not in clean
    assert "OAuth" in clean


def test_sanitise_truncates_long_comment():
    from services.comment_relay import CommentRelay
    long_text = "A" * 5000
    clean = CommentRelay._sanitise(long_text)
    assert len(clean) <= 4020  # 4000 + "[truncated]"
    assert "[truncated]" in clean


def test_sanitise_decodes_html_entities():
    from services.comment_relay import CommentRelay
    text = "Use &quot;Bearer&quot; tokens &amp; refresh when expired"
    clean = CommentRelay._sanitise(text)
    assert '"Bearer"' in clean
    assert "&" in clean


@pytest.mark.asyncio
async def test_cockpit_status_comments_not_relayed():
    """Comments starting with status emojis are not injected."""
    from fakeredis.aioredis import FakeRedis
    from services.job_store import JobStore
    from services.comment_relay import CommentRelay
    from services.pr_commenter import PRCommenter
    from models import JobStatus
    import config
    from datetime import datetime

    r = FakeRedis(decode_responses=True)
    store = JobStore.__new__(JobStore)
    store._redis = r

    commenter = AsyncMock(spec=PRCommenter)
    relay = CommentRelay(store, commenter)
    relay._get_client = MagicMock()

    # Build a minimal job in redis
    from services.job_store import JobStore as JS
    job = JS.make_job(
        github_repo="mlopstapus/seamless",
        issue_number=1,
        issue_title="[COCKPIT] test",
        issue_body="body",
        repo_path="/repos/s",
    )
    await store.enqueue(job)
    await store.update(job.id, status=JobStatus.RUNNING)

    # Simulate a ✅ ack comment from owner — should be skipped
    ack_comment = {
        "id": 501,
        "user": {"login": "mlopstapus"},
        "body": "✅ Got it — continuing",
    }
    relay._get_client.return_value = MagicMock()
    relay._get_client.return_value.get = AsyncMock(
        return_value=MagicMock(status_code=200, json=lambda: [ack_comment])
    )

    inject_q = relay.get_inject_queue(job.id)

    with patch.object(config.settings, "github_owner", "mlopstapus"):
        await relay._check_comments(job)

    # Nothing should have been injected
    assert inject_q.empty()
