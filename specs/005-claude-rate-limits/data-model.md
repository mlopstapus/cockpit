# Data Model: Claude Rate Limit Handling

**Feature**: 005-claude-rate-limits
**Date**: 2026-03-24

---

## Schema Changes

### jobs table — two new columns

Added via `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS` in `openDb()`:

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `rate_limit_reset_at` | `TEXT` | NULL | YES | ISO 8601 timestamp at which the Anthropic rate limit resets; NULL when not rate-limited |
| `rate_limit_count` | `INTEGER` | 0 | NO | Number of rate-limit events this job has experienced; capped at 3 before permanent failure |

### jobs.status — new value

| Status | Meaning |
|--------|---------|
| `queued` | Waiting to be picked up (existing) |
| `active` | Currently running (existing) |
| `completed` | Pipeline finished successfully (existing) |
| `failed` | Terminal failure (existing) |
| `cancelled` | Manually cancelled (existing) |
| **`rate_limited`** | **NEW — paused; waiting for `rate_limit_reset_at` to pass** |

---

## State Transitions

```
queued
  ↓  (dequeueJob)
active
  ↓  (stage succeeds → next stage)
active  ... (cycles through stages)
  ↓  (markComplete)
completed

active
  ↓  (non-rate-limit failure)
failed

active
  ↓  (rate limit detected, count < 3)
rate_limited ──── (reset time arrives, requeueExpiredRateLimited) ────→ queued
                                                                           ↓
                                                                        active (resumes from same stage)

active
  ↓  (rate limit detected, count = 3)
failed  [terminal — "rate-limit retry limit reached"]
```

---

## New DB Functions (src/db/jobs.js)

### markRateLimited(db, id, resetAt, newCount)
Sets `status = 'rate_limited'`, `rate_limit_reset_at = resetAt`, `rate_limit_count = newCount`, `updated_at = now()`.

### requeueExpiredRateLimited(db)
`UPDATE jobs SET status = 'queued', rate_limit_reset_at = NULL, updated_at = now() WHERE status = 'rate_limited' AND rate_limit_reset_at <= now()`
Returns the count of rows updated (for logging).

### listRateLimited(db)
`SELECT * FROM jobs WHERE status = 'rate_limited'` — used by `cockpit status`.

---

## New Module (src/process/rate-limit-detector.js)

Stateless functions only. No DB dependency.

### detectRateLimit(output) → { isRateLimit: boolean, resetAt: Date|null, raw: string|null }

Scans `output` string for rate-limit message patterns.

**Patterns checked (in priority order)**:

| Pattern | Example match | Extraction |
|---------|---------------|-----------|
| ISO 8601 timestamp in rate-limit context | `"limit reached... 2026-03-24T14:30:00.000Z"` | Parse ISO string directly |
| "resets at HH:MM AM/PM UTC" | `"resets at 3:00 PM UTC"` | Parse with today's date |
| Unix epoch integer after "reset" keyword | `"reset: 1742824200"` | `new Date(epoch * 1000)` |
| Bare rate-limit detection (no timestamp) | `"Claude AI usage limit reached"` | `resetAt = null` (triggers fallback) |

Returns `{ isRateLimit: false, resetAt: null, raw: null }` if no match found.

### formatResetMessage(resetAt, fallbackMinutes) → string

Produces the human-readable string for the GitHub comment:
- If `resetAt` is known: `"resets at 14:30 UTC (in approximately 47 minutes)"`
- If `resetAt` is null (fallback): `"reset time unknown — waiting 60 minutes (fallback)"`
