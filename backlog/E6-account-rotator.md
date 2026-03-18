# E6: Account Rotator Enhancement

**Status**: Pending
**Depends on**: E2 (pipeline runner must react to rotation signal)
**Estimated scope**: Adapt existing service (~100 LOC changes) + tests

---

## Goal

Detect rate limit signals in Claude Code PTY output. When detected: gracefully
pause the active pipeline stage, swap the Claude profile directory to the next
account in the pool, and resume from the same stage.

---

## What Exists (Adapt)

`backend/services/account_rotator.py` — already implements round-robin account
switching. It was built for the old session model. Changes needed:

1. Add rate-limit signal detection (currently a TODO/stub)
2. Connect detection to pipeline_runner pause/resume hooks
3. Track per-account rate limit windows (back off for ~60s before retry)

---

## Rate Limit Signal Detection

Claude Code outputs recognisable text when hitting rate limits. Watch for:

```
Rate limit reached
Too many requests
Claude is currently unavailable
You've reached your usage limit
```

These strings are matched (case-insensitive) against each PTY output line in
`pipeline_runner._run_job`. When matched, emit a `RATE_LIMITED` signal.

---

## Changes to `account_rotator.py`

```python
class AccountRotator:
    profiles: list[str]          # paths to ~/.claude-profiles/{name}
    active_index: int
    cooldown: dict[str, float]   # profile_path → timestamp when usable again

    def detect_rate_limit(self, line: str) -> bool
      # returns True if line matches any rate limit pattern

    async def rotate(self) -> str | None
      # returns next available profile path, or None if all cooling down

    async def resume_after_cooldown() -> str
      # waits until any profile exits cooldown, returns profile path
```

---

## Pipeline Runner Integration

In `pipeline_runner._run_job`, after each PTY output line:

```python
if account_rotator.detect_rate_limit(line):
    job_store.update(job_id, status="paused", pause_reason="rate_limit")
    await pr_commenter.post_stage_start(job, f"⏸ Rate limited — rotating account")
    new_profile = await account_rotator.resume_after_cooldown()
    if new_profile:
        claude_process.set_profile(new_profile)
        job_store.update(job_id, status="running", account_id=new_profile)
    else:
        job_store.mark_failed(job_id, "All accounts rate limited")
        break
```

---

## Account Profile Swap

Claude Code uses `CLAUDE_CONFIG_DIR` env var to locate its config directory.
Swapping accounts = pointing `CLAUDE_CONFIG_DIR` to a different profile path
and spawning a new PTY session at the same stage.

The pipeline runner must:
1. Terminate the current PTY session cleanly
2. Update `CLAUDE_CONFIG_DIR` to new profile
3. Spawn new PTY session
4. Re-send the current stage command (resume from beginning of stage)

---

## Security

- Profile directory paths validated to exist before use
- No credentials in logs — account rotation logged as "rotated to account [index]",
  not profile path or token value
- Cooldown tracked in memory (Redis optional — in-memory sufficient since single process)

---

## Tests

`backend/tests/test_account_rotator.py`

- [ ] `test_detects_rate_limit_signal` — known rate limit strings trigger detection
- [ ] `test_does_not_false_positive` — normal output lines return False
- [ ] `test_rotate_returns_next_profile` — rotate cycles through profiles in order
- [ ] `test_rotate_skips_cooling_down_profile` — profile in cooldown not selected
- [ ] `test_all_cooling_down_returns_none_then_waits` — when all profiles cooling,
  `rotate` waits until first exits cooldown
- [ ] `test_pipeline_resumes_after_rotation` — mock rate limit signal mid-stage,
  assert stage re-runs after rotation

Use `pytest-asyncio`, `freezegun` for cooldown time manipulation.

---

## Definition of Done

- [ ] Rate limit signals detected from PTY output in real time
- [ ] Pipeline pauses, rotates account, resumes same stage
- [ ] PR comment posted when rotation occurs ("⏸ Rate limited — rotating account")
- [ ] Per-account cooldown tracked (60s default)
- [ ] All tests pass
- [ ] Account identities never appear in log output
