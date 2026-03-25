# Data Model: CLI Retry Command

**Feature**: 008-cli-retry-command
**Date**: 2026-03-25

## Schema Changes

**None.** The existing `jobs` table already has all required columns. No migrations needed.

## Existing `jobs` Table — Relevant Columns

| Column | Type | Default | Role in Retry |
|--------|------|---------|---------------|
| `id` | TEXT PK | — | Identifies the job to retry |
| `status` | TEXT | `'queued'` | Reset to `'queued'` by retry |
| `stage` | TEXT | `'idle'` | **Preserved** — pipeline resumes from here |
| `error` | TEXT | NULL | Cleared (set to NULL) by retry |
| `rate_limit_count` | INTEGER | 0 | Reset to 0 so fresh auto-retry budget applies |
| `rate_limit_reset_at` | TEXT | NULL | Cleared (set to NULL) by retry |
| `updated_at` | TEXT | — | Set to `now()` by retry; used for `--last` ordering |

## State Transition: Failed → Queued (Retry)

```
failed (stage=X) ──cockpit retry──► queued (stage=X)
                                     error=NULL
                                     rate_limit_count=0
                                     rate_limit_reset_at=NULL
```

The daemon's existing dequeue path picks up `status='queued'` jobs and dispatches them at the current `stage`, so no daemon-side changes are required.

## New DB Functions (in `src/db/jobs.js`)

### `retryJob(db, id)`

Atomically resets a `failed` job to `queued` state.

- **Pre-condition**: job exists with `status = 'failed'`
- **Post-condition**: `status = 'queued'`, `error = NULL`, `rate_limit_count = 0`, `rate_limit_reset_at = NULL`, `updated_at = now`
- **Returns**: `{ success: true, job }` if updated; `{ success: false, reason: 'not_found' | 'wrong_state' }` otherwise
- Uses a single conditional `UPDATE … WHERE id = ? AND status = 'failed'`; checks `changes` count to distinguish "not found" from "wrong state"

### `getLastFailedJob(db)`

Returns the most recently failed job for `cockpit retry --last`.

- **Query**: `SELECT * FROM jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 1`
- **Returns**: job row or `null` if no failed jobs exist
