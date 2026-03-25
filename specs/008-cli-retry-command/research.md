# Research: CLI Retry Command

**Feature**: 008-cli-retry-command
**Date**: 2026-03-25

## Decision 1: DB mutation scope for retry

**Decision**: Reset `status = 'queued'`, `error = NULL`, `rate_limit_count = 0`, `rate_limit_reset_at = NULL`, `updated_at = now`. Leave `stage` unchanged.

**Rationale**: The spec (clarified) requires resuming from the failed stage, not a full restart. Resetting `rate_limit_count` and `rate_limit_reset_at` is consistent with FR-011 (fresh automatic retry attempts) and mirrors how `requeueExpiredRateLimited` already clears `rate_limit_reset_at`. Leaving `stage` untouched lets the daemon's existing stage-dispatch logic resume from the correct point without any daemon-side changes.

**Alternatives considered**:
- Reset stage to `idle` (full restart): Rejected per clarification answer (Option B).
- Only reset `status` and `error`: Would leave a stale `rate_limit_count` that could cause the auto-retry cap to fire prematurely on the next failure.

---

## Decision 2: Placement of retry DB logic

**Decision**: Add `retryJob(db, id)` and `getLastFailedJob(db)` to the existing `src/db/jobs.js` module.

**Rationale**: All job CRUD lives in `jobs.js` already (`getJob`, `markFailed`, `requeueExpiredRateLimited`, etc.). Adding retry functions there keeps cohesion and follows the established pattern.

**Alternatives considered**:
- New `src/db/retry.js`: Unnecessary fragmentation for two small functions.

---

## Decision 3: CLI module placement

**Decision**: New file `src/cli/retry.js` exporting a `retryJob` action function, registered in `src/cli/index.js`.

**Rationale**: Every other CLI subcommand lives in its own `src/cli/*.js` module (`logs.js`, `repos.js`, `token.js`). A new `retry.js` is consistent with that pattern.

**Alternatives considered**:
- Inline in `index.js`: Would make `index.js` larger than it already is; other commands are extracted.

---

## Decision 4: `--last` ordering

**Decision**: `ORDER BY updated_at DESC LIMIT 1` on `status = 'failed'` rows.

**Rationale**: `updated_at` is set when a job transitions to `failed`, making it the most accurate proxy for "when it failed". IDs are random hex (not sequential integers), so `updated_at` is the only reliable ordering key.

**Alternatives considered**:
- Order by `id`: IDs are random 4-byte hex strings — not time-ordered.
- Order by `created_at`: Reflects when the job was enqueued, not when it failed; a job that was queued early but failed late would not sort correctly.

---

## Decision 5: Atomicity / race condition handling

**Decision**: Use a conditional `UPDATE … WHERE id = ? AND status = 'failed'` and check `changes` to detect races. No explicit transaction needed for this single-statement update.

**Rationale**: SQLite serialises writes; a single `UPDATE … WHERE status = 'failed'` is atomic. If the daemon dequeues the job between the CLI's read and write, `changes = 0` signals the conflict and the CLI can report a meaningful error ("job is no longer in failed state").

**Alternatives considered**:
- Read-then-write in a transaction: More complex; the single conditional UPDATE is equivalent and simpler.

---

## Findings: No external research required

All dependencies are already in-tree (`better-sqlite3`, `commander@12`, `chalk`). No new packages needed.
