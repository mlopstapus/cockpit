"""Tests for AccountRotator including rate limit detection."""
import pytest
from services.account_rotator import AccountRotator


def test_detect_rate_limit_known_signals():
    """Known rate limit strings trigger detection."""
    rotator = AccountRotator()
    signals = [
        "Rate limit reached",
        "Too many requests",
        "Claude is currently unavailable",
        "You've reached your usage limit",
        "Please wait before sending more messages",
        "Try again in 2 minutes",
    ]
    for s in signals:
        assert rotator.detect_rate_limit(s), f"Expected rate limit detection for: {s!r}"


def test_detect_rate_limit_no_false_positives():
    """Normal output lines do not trigger detection."""
    rotator = AccountRotator()
    normal_lines = [
        "Creating spec.md file",
        "Plan complete — tasks.md written",
        "Running tests: all passed",
        "Pushing branch to GitHub",
        "Pull request created",
    ]
    for line in normal_lines:
        assert not rotator.detect_rate_limit(line), f"False positive for: {line!r}"


def test_get_best_account_returns_available():
    rotator = AccountRotator()
    account = rotator.get_best_account()
    assert account is not None
    assert not account.is_rate_limited


def test_rotate_skips_rate_limited():
    from config import AccountConfig
    from services.account_rotator import AccountState
    rotator = AccountRotator()
    # Add a secondary account so rotation has somewhere to go
    secondary_cfg = AccountConfig(id="secondary", name="Secondary", config_dir="~/.claude", priority=2)
    rotator.accounts["secondary"] = AccountState(secondary_cfg)
    # Mark primary as rate limited — should fall back to secondary
    rotator.mark_rate_limited("primary", retry_after_seconds=9999)
    account = rotator.get_best_account()
    assert account.id == "secondary"


def test_all_limited_raises():
    rotator = AccountRotator()
    for acc_id in rotator.accounts:
        rotator.mark_rate_limited(acc_id, retry_after_seconds=9999)
    with pytest.raises(RuntimeError, match="rate limited"):
        rotator.get_best_account()
