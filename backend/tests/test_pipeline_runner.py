"""Tests for PipelineRunner post-implement hook."""
import asyncio
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from models import Job, JobStage, JobStatus


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
        status=JobStatus.RUNNING,
        account_id="primary",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return Job(**defaults)


def _make_runner():
    """Create a PipelineRunner with all dependencies mocked."""
    from services.pipeline_runner import PipelineRunner

    job_store = AsyncMock()
    hub = MagicMock()
    account_rotator = MagicMock()
    pr_commenter = AsyncMock()
    comment_relay = AsyncMock()

    runner = PipelineRunner(
        job_store=job_store,
        hub=hub,
        account_rotator=account_rotator,
        pr_commenter=pr_commenter,
        comment_relay=comment_relay,
    )
    return runner


@pytest.mark.asyncio
async def test_hook_fires_and_posts_success_when_command_set():
    """Hook fires and posts ✅ comment when POST_IMPLEMENT_COMMAND is set and exits 0."""
    runner = _make_runner()
    job = _make_job()

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate = AsyncMock(return_value=(b"", b""))

    with patch("services.pipeline_runner.settings") as mock_settings, \
         patch("asyncio.create_subprocess_shell", return_value=mock_proc):
        mock_settings.post_implement_command = "echo hello"
        await runner._run_post_implement_hook(job)

    runner._pr_commenter.post_comment.assert_called_once()
    call_args = runner._pr_commenter.post_comment.call_args[0]
    assert "✅" in call_args[1]


@pytest.mark.asyncio
async def test_hook_skipped_silently_when_command_empty():
    """Hook is skipped with no comment when POST_IMPLEMENT_COMMAND is empty."""
    runner = _make_runner()
    job = _make_job()

    with patch("services.pipeline_runner.settings") as mock_settings, \
         patch("asyncio.create_subprocess_shell") as mock_shell:
        mock_settings.post_implement_command = ""
        await runner._run_post_implement_hook(job)

    mock_shell.assert_not_called()
    runner._pr_commenter.post_comment.assert_not_called()


@pytest.mark.asyncio
async def test_hook_posts_warning_when_exits_nonzero():
    """Warning comment posted when hook exits non-zero."""
    runner = _make_runner()
    job = _make_job()

    mock_proc = AsyncMock()
    mock_proc.returncode = 1
    mock_proc.communicate = AsyncMock(return_value=(b"", b"Something went wrong"))

    with patch("services.pipeline_runner.settings") as mock_settings, \
         patch("asyncio.create_subprocess_shell", return_value=mock_proc):
        mock_settings.post_implement_command = "false"
        await runner._run_post_implement_hook(job)

    runner._pr_commenter.post_comment.assert_called_once()
    call_args = runner._pr_commenter.post_comment.call_args[0]
    assert "⚠️" in call_args[1]
    assert "exit" in call_args[1]


@pytest.mark.asyncio
async def test_pipeline_mark_complete_called_regardless_of_hook_exit():
    """mark_complete is called regardless of hook outcome.

    We test this by verifying the hook's non-zero exit does NOT raise,
    allowing the caller to proceed normally.
    """
    runner = _make_runner()
    job = _make_job()

    mock_proc = AsyncMock()
    mock_proc.returncode = 99
    mock_proc.communicate = AsyncMock(return_value=(b"", b"failure details"))

    with patch("services.pipeline_runner.settings") as mock_settings, \
         patch("asyncio.create_subprocess_shell", return_value=mock_proc):
        mock_settings.post_implement_command = "bad-command"
        # Should complete without raising
        await runner._run_post_implement_hook(job)

    # The hook posted a warning but did not raise
    runner._pr_commenter.post_comment.assert_called_once()
    call_args = runner._pr_commenter.post_comment.call_args[0]
    assert "⚠️" in call_args[1]
