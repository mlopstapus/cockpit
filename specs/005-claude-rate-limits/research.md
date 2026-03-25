# Research: Claude Rate Limit Handling

**Feature**: 005-claude-rate-limits
**Date**: 2026-03-24

---

## Decision 1: How Claude's rate-limit message appears in process output

**Decision**: Scan the accumulated stdout/stderr of the Claude Code process for known rate-limit message patterns. Claude Code (the CLI) prints a human-readable error to stdout/stderr when the Anthropic usage limit is hit, typically containing phrases like `"Claude AI usage limit reached"` and a reset timestamp in ISO 8601 or human-readable form.

**Rationale**: The spec clarification confirmed detection via stdout/stderr. The existing `runClaudeStage` function already accumulates all stdout+stderr into an `output` string before rejecting the promise on non-zero exit. The rate-limit message is emitted before the process exits. No additional API calls are needed.

**Alternatives considered**:
- Calling the Anthropic API to poll rate limit headers — rejected because it requires separate credentials and adds network round-trips; the output text is sufficient.
- Relying on exit code alone — rejected because Claude may exit non-zero for many reasons (stage failures, network issues, etc.); exit code alone cannot distinguish rate-limit from other failures.

**Known message formats** (from Anthropic CLI and API behaviour):
```
Claude AI usage limit reached. Your limit will reset at <timestamp>.
```
Where `<timestamp>` may appear as:
- ISO 8601: `2026-03-24T14:30:00.000Z`
- Human-readable: `3:00 PM UTC` or `March 24, 2026 at 3:00 PM`
- Unix epoch integer (less common but observed in API responses)

**Implication for implementation**: A multi-pattern regex is needed. When none of the patterns match a timestamp, the fallback wait period applies. The detector must be a separate, well-tested module to avoid embedding fragile regexes in stage-executor.

---

## Decision 2: Where to persist rate-limit wait state

**Decision**: Add two new nullable columns to the existing `jobs` table: `rate_limit_reset_at TEXT` (ISO timestamp) and `rate_limit_count INTEGER DEFAULT 0`. Add a new job status value `'rate_limited'`.

**Rationale**: The clarification confirmed durable persistence for crash recovery. The existing schema uses `CREATE TABLE IF NOT EXISTS`; SQLite allows `ALTER TABLE ADD COLUMN IF NOT EXISTS` at startup in `openDb()` to add new columns without breaking existing installations. No migration tooling is required.

**Alternatives considered**:
- A separate `rate_limit_events` table — rejected; overkill for two fields; the job row already has all the context needed.
- In-memory state only — rejected; fails the crash-recovery requirement.
- Adding a new `meta` JSON column — rejected; harder to query and index.

---

## Decision 3: Resume mechanism after rate-limit wait

**Decision**: The poller loop calls `requeueExpiredRateLimited(db)` at the start of each cycle. This moves any `rate_limited` job whose `rate_limit_reset_at <= now()` back to `'queued'`. The existing `dequeueJob` then picks it up, and the existing stage-resume logic (job.stage already set) replays from the interrupted stage.

**Rationale**: This integrates cleanly with the existing FIFO queue and poller architecture. No new timers or long-sleeps inside `executeJob` are needed. Crash recovery is automatic: on daemon restart, the poller's first cycle re-evaluates all `rate_limited` jobs.

**Alternatives considered**:
- `setTimeout` inside `executeJob` to sleep until reset time — rejected; blocks the job runner, doesn't survive daemon restart.
- A dedicated "rate-limit watcher" background timer — rejected; unnecessary complexity; the 30-second poll loop is already sufficient granularity (SC-002 requires resume within 60s of reset time, which is satisfied by the ≤30s poll interval).

---

## Decision 4: Output capture on Claude process failure

**Decision**: Modify `runClaudeStage` to attach the accumulated `output` string to the rejected Error object (`error.output = output`) so the catch block in `executeJob` can inspect it for rate-limit patterns.

**Rationale**: Currently `output` is scoped inside `runClaudeStage` and is lost on rejection. This is a minimal, backward-compatible change — the error interface gains a new optional property, existing callers that only read `err.message` are unaffected.

**Alternatives considered**:
- Returning a result object instead of Promise.reject — rejected; requires changing all callers.
- Capturing output in a shared closure passed from outside — rejected; more invasive refactor.

---

## Decision 5: Maximum retry cap and terminal failure

**Decision**: Cap at 3 rate-limit retries per job (FR-009). `rate_limit_count` is incremented each time `markRateLimited` is called. When `rate_limit_count` would exceed 3, `markFailed` is called instead with a descriptive terminal error message, and a GitHub comment is posted.

**Rationale**: Confirmed in clarification. Three retries provides generous tolerance for legitimate long-running jobs while preventing infinite loops from a persistently broken state.

---

## Decision 6: cockpit status visibility

**Decision**: Update `showStatus` in `daemon-control.js` to also query `rate_limited` jobs and display them with their reset time. The existing `listActive` only shows `active` status; a new `listRateLimited(db)` query covers the waiting state.

**Rationale**: FR-007 and SC-004 require the waiting state to be visible within 5 seconds. Since `cockpit status` is a read-only CLI query against SQLite, it will reflect the persisted state immediately.
