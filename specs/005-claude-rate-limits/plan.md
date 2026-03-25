# Implementation Plan: Claude Rate Limit Handling

**Branch**: `005-claude-rate-limits` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-claude-rate-limits/spec.md`

## Summary

When a Claude Code process exits due to an Anthropic usage/rate limit, Cockpit must detect the condition by parsing the process stdout/stderr, post a GitHub issue comment with the stage name and reset time, persist the wait state to SQLite, and automatically resume the interrupted stage once the reset time passes — without any manual intervention. Jobs that hit the rate limit more than 3 times are permanently failed. All logic runs in the Cockpit daemon; Claude is not involved in detection.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `better-sqlite3`, `@octokit/rest`, `node:child_process` (spawn)
**Storage**: SQLite via `better-sqlite3` (`~/.cockpit/cockpit.db`) — two new columns added via `ALTER TABLE ADD COLUMN`
**Testing**: `node:test` (built-in)
**Target Platform**: macOS / Linux developer host (bare metal or VM)
**Project Type**: CLI daemon / background service
**Performance Goals**: Rate-limit comment posted within 30s of detection; job resumes within 60s of reset time
**Constraints**: No new runtime dependencies; no containerisation; config stays in `~/.cockpit/config.json`
**Scale/Scope**: Single-user, one job at a time

## Constitution Check

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All logic scoped to feature branch; fallback wait period is a hardcoded constant (`RATE_LIMIT_FALLBACK_MS`) in stage-executor.js — configurability deferred to backlog (see plan section 8) | ✅ |
| II. Thorough Change Review | Delivered as PR; session logs available | ✅ |
| III. Security First | No new external inputs; rate-limit message text is sanitised before posting to GitHub (existing `redactSecrets` + new strip); no secrets in output | ✅ |
| IV. Test-Driven Implementation | Unit tests for detector module; DB function tests; stage-executor integration tests | ✅ |
| V. Dev Box Execution Model | All logic runs on host; no containers; fallback wait configurable via config.json | ✅ |
| VI. Continuous Self-Improvement | `/ralph` at session close | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/005-claude-rate-limits/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── process/
│   ├── claude-process.js        (existing — unchanged)
│   └── rate-limit-detector.js   (NEW)
├── daemon/
│   ├── stage-executor.js        (MODIFY — detect rate limit, markRateLimited, cap at 3)
│   └── poller.js                (MODIFY — call requeueExpiredRateLimited each cycle)
├── db/
│   ├── index.js                 (MODIFY — ALTER TABLE to add 2 new columns)
│   └── jobs.js                  (MODIFY — 3 new functions)
└── cli/
    └── daemon-control.js        (MODIFY — show rate_limited jobs in cockpit status)

test/
├── rate-limit-detector.test.js  (NEW)
├── stage-executor.test.js       (MODIFY — add rate-limit scenarios)
└── jobs.test.js                 (MODIFY — add new function tests)
```

**Structure Decision**: Single project, Option 1. No structural changes to the repository; this feature adds one new source file and modifies four existing ones.

## Complexity Tracking

> No Constitution violations.

---

## Phase 0: Research

See [research.md](research.md) for all decisions and rationale. Summary:

| Unknown | Resolution |
|---------|------------|
| How to detect rate limit | Parse Claude stdout/stderr for known message patterns |
| How to get reset timestamp | Extract from the same message text via multi-pattern regex |
| Where to persist wait state | Two new columns on `jobs` table; new `rate_limited` status |
| Resume mechanism | `requeueExpiredRateLimited` called by poller each cycle |
| Output capture on failure | Attach `output` to rejected Error in `runClaudeStage` |
| Retry cap | 3 retries; 4th hit permanently fails the job |

---

## Phase 1: Design

### 1. Schema Changes (`src/db/index.js`)

Add to `openDb()` after the `CREATE TABLE IF NOT EXISTS` block:

```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rate_limit_reset_at TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rate_limit_count     INTEGER NOT NULL DEFAULT 0;
```

SQLite `ALTER TABLE ADD COLUMN IF NOT EXISTS` is safe to run on existing databases — it is a no-op when the column already exists (SQLite ≥ 3.37). The existing WAL-mode setup in `openDb` handles this correctly.

### 2. New DB Functions (`src/db/jobs.js`)

**`markRateLimited(db, id, resetAt, newCount)`**
```
UPDATE jobs
SET status = 'rate_limited',
    rate_limit_reset_at = <resetAt ISO string or null>,
    rate_limit_count = <newCount>,
    updated_at = <now>
WHERE id = <id>
```

**`requeueExpiredRateLimited(db)`**
```
UPDATE jobs
SET status = 'queued',
    rate_limit_reset_at = NULL,
    updated_at = <now>
WHERE status = 'rate_limited'
  AND (rate_limit_reset_at IS NULL OR rate_limit_reset_at <= <now ISO>)
RETURNING id
```
Called by the poller each cycle. Returns count of requeued jobs for logging.

**`listRateLimited(db)`**
```
SELECT * FROM jobs WHERE status = 'rate_limited' ORDER BY updated_at DESC
```
Used by `cockpit status`.

### 3. Rate Limit Detector (`src/process/rate-limit-detector.js`)

```js
// Returns: { isRateLimit: boolean, resetAt: Date|null }
export function detectRateLimit(output) { ... }

// Returns human-readable string for GitHub comment
export function formatResetMessage(resetAt, fallbackMinutes = 60) { ... }
```

**Detection logic** (`detectRateLimit`):
1. Check if `output` contains a rate-limit indicator phrase (case-insensitive):
   - `"claude ai usage limit reached"`
   - `"usage limit reached"`
   - `"rate limit exceeded"`
   - `"api usage limit"`
2. If no phrase found → `{ isRateLimit: false, resetAt: null }`
3. If phrase found, attempt timestamp extraction in order:
   a. ISO 8601: `/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`
   b. Unix epoch after "reset": `/reset[^\d]*(\d{10,13})/i`
   c. Time string: `/(reset[s]?|resets?) at (\d{1,2}:\d{2}\s?(?:AM|PM)?(?:\s?UTC)?)/i`
4. Return `{ isRateLimit: true, resetAt: <Date or null> }`

**Format logic** (`formatResetMessage`):
- If `resetAt` is known: `"Rate limit hit — resets at 14:30 UTC (in approximately 47 minutes). Pipeline will resume automatically."`
- If `resetAt` is null: `"Rate limit hit — reset time unknown. Waiting 60 minutes (fallback). Pipeline will resume automatically."`

### 4. Output Capture Fix (`src/daemon/stage-executor.js` — `runClaudeStage`)

In the `proc.on('close', ...)` handler, attach output to the error before rejecting:

```js
const error = new Error(`claude exited with code ${code}`);
error.output = output;
reject(error);
```

### 5. Rate Limit Handling in executeJob (`src/daemon/stage-executor.js`)

In the catch block for `runClaudeStage`, before the existing `markFailed` path:

```
const rawOutput = err.output || '';
const { isRateLimit, resetAt } = detectRateLimit(rawOutput);

if (isRateLimit) {
  const newCount = (job.rate_limit_count || 0) + 1;

  if (newCount > 3) {
    // Terminal failure
    markFailed(db, job.id, `Rate limit retry limit reached (3 attempts)`);
    postIssueComment(..., '⏸️ **Rate limit retry limit reached** ...')
    return;
  }

  // Compute wait time
  const fallbackMs = 60 * 60 * 1000;
  const resumeAt = resetAt ?? new Date(Date.now() + fallbackMs);

  markRateLimited(db, job.id, resumeAt.toISOString(), newCount);

  const msg = formatResetMessage(resetAt);
  postIssueComment(...,
    `⏸️ **Rate limit reached — stage ${STAGE_LABELS[stage.name]}**\n\n${msg}\n\nRetry ${newCount}/3.`
  );

  log(`[cockpit] Rate limited (attempt ${newCount}/3). Resuming at ${resumeAt.toISOString()}`);
  return;  // job stays in DB as rate_limited; poller will requeue it
}

// Existing failure path:
markFailed(db, job.id, `Stage ${stage.name} failed: ${err.message}`);
...
```

### 6. Poller Integration (`src/daemon/poller.js`)

At the top of each poll cycle (before polling repos), add:

```js
const requeued = requeueExpiredRateLimited(db);
if (requeued > 0) {
  console.log(`[cockpit] Requeued ${requeued} rate-limited job(s)`);
}
```

Import `requeueExpiredRateLimited` from `../db/jobs.js`.

### 7. cockpit status (`src/cli/daemon-control.js`)

In `showStatus`, after displaying active jobs, add:

```js
const waiting = listRateLimited(db);
if (waiting.length > 0) {
  for (const j of waiting) {
    const resumeAt = j.rate_limit_reset_at
      ? new Date(j.rate_limit_reset_at).toLocaleTimeString()
      : 'unknown';
    console.log(`Waiting (rate-limited): ${j.id} (${j.spec_name}) — stage: ${j.stage} — resumes: ${resumeAt} — attempt ${j.rate_limit_count}/3`);
  }
}
```

### 8. Config: Fallback Wait Period

The fallback wait period (60 minutes) is **not** added to `config.json` in this iteration — the assumption is 60 minutes is sufficient and making it configurable is deferred to backlog if needed. The constant lives in `stage-executor.js` as `RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000`.

---

## Test Plan

### `test/rate-limit-detector.test.js` (new)

| Test | Description |
|------|-------------|
| detects ISO 8601 timestamp in rate-limit message | `detectRateLimit('Claude AI usage limit reached... 2026-03-24T14:30:00Z')` → `{ isRateLimit: true, resetAt: Date }` |
| detects unix epoch in rate-limit message | `detectRateLimit('rate limit exceeded, reset: 1742824200')` → `{ isRateLimit: true, resetAt: Date }` |
| detects time string in rate-limit message | `detectRateLimit('usage limit reached, resets at 3:00 PM UTC')` → `{ isRateLimit: true, resetAt: Date or null }` |
| returns isRateLimit: true, resetAt: null when no timestamp | `detectRateLimit('Claude AI usage limit reached')` → `{ isRateLimit: true, resetAt: null }` |
| returns isRateLimit: false for normal errors | `detectRateLimit('Error: command not found')` → `{ isRateLimit: false }` |
| formatResetMessage with known resetAt | produces human-readable string with time and minutes |
| formatResetMessage with null resetAt | produces fallback string mentioning 60 minutes |

### `test/jobs.test.js` (additions)

| Test | Description |
|------|-------------|
| markRateLimited sets correct status and fields | job transitions to `rate_limited` with correct `rate_limit_reset_at` and `rate_limit_count` |
| requeueExpiredRateLimited requeues past-deadline jobs | job with `rate_limit_reset_at` in the past moves to `queued` |
| requeueExpiredRateLimited ignores future-deadline jobs | job with `rate_limit_reset_at` in the future stays `rate_limited` |
| listRateLimited returns only rate_limited jobs | |

### `test/stage-executor.test.js` (additions)

| Test | Description |
|------|-------------|
| rate-limit on first attempt sets status to rate_limited | job becomes `rate_limited`, comment posted, count = 1 |
| rate-limit on 3rd attempt fails job permanently | job becomes `failed`, terminal comment posted |
| non-rate-limit error still calls markFailed | existing behaviour unchanged |
| output attached to error in runClaudeStage rejection | `err.output` contains the accumulated text |
