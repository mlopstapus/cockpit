# Implementation Plan: CLI Retry Command

**Branch**: `008-cli-retry-command` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-cli-retry-command/spec.md`

## Summary

Add `cockpit retry <job-id>` and `cockpit retry --last` CLI subcommands that requeue a failed job for re-execution. The retry resets `status → queued`, `error → NULL`, and `rate_limit_count → 0` while **preserving `stage`** so the pipeline resumes from where it failed. No schema changes, no daemon changes, and no new dependencies are required — only two new DB functions and one new CLI module.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `commander@12`, `chalk`, `better-sqlite3` (all already in-tree)
**Storage**: SQLite at `~/.cockpit/cockpit.db` — no schema changes needed
**Testing**: `node:test` (built-in)
**Target Platform**: macOS/Linux CLI
**Project Type**: CLI tool
**Performance Goals**: Sub-second response (single SQLite UPDATE)
**Constraints**: Must work without daemon running; no new npm packages
**Scale/Scope**: Single-machine local use; single-row DB update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All changes on feature branch `008-cli-retry-command`. No project-specific behaviour hardcoded — DB path uses existing `expandHome('~/.cockpit')` config pattern. | ✅ |
| II. Thorough Change Review | Delivered as a PR; session logs available. | ✅ |
| III. Security First | No external inputs; `job-id` is a CLI argument used only as a SQLite parameterised query value — no injection risk. No secrets involved. | ✅ |
| IV. Test-Driven Implementation | Tests for `retryJob`, `getLastFailedJob`, and CLI error paths planned alongside implementation (see Implementation Plan below). | ✅ |
| V. Dev Box Execution Model | Pure CLI tool; runs directly on host OS. No containers, no post-implement hooks required. | ✅ |
| VI. Always Self-Reflect | Design reviewed against spec and acceptance criteria. Simplest correct approach confirmed (single conditional UPDATE, no transaction needed). `/ralph` to be invoked at session close. | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/008-cli-retry-command/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/
│   └── cli-retry.md     ← CLI command contract
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code Changes

```text
src/
├── db/
│   └── jobs.js          ← add retryJob() + getLastFailedJob()
└── cli/
    ├── retry.js          ← NEW: retry subcommand action
    └── index.js          ← register cockpit retry command

test/
└── unit/
    ├── db.test.js        ← add retryJob + getLastFailedJob tests
    └── retry.test.js     ← NEW: CLI retry command tests
```

**Structure Decision**: Single-project layout, consistent with the existing `src/cli/*.js` + `src/db/*.js` pattern. No new directories.

## Implementation Plan

### Step 1: DB layer — `src/db/jobs.js`

Add two functions:

**`retryJob(db, id)`**
```
1. SELECT * FROM jobs WHERE id = ?
2. If no row → return { success: false, reason: 'not_found' }
3. If row.status !== 'failed' → return { success: false, reason: 'wrong_state', status: row.status }
4. UPDATE jobs SET status='queued', error=NULL, rate_limit_count=0, rate_limit_reset_at=NULL, updated_at=now WHERE id=? AND status='failed'
5. If changes === 0 → return { success: false, reason: 'wrong_state', status: 'unknown' }  (race)
6. Return { success: true, job: { ...row, status: 'queued', error: null } }
```

**`getLastFailedJob(db)`**
```
SELECT * FROM jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 1
Returns row or null.
```

### Step 2: CLI module — `src/cli/retry.js`

Export `retryFailedJob(db, jobId, opts)`:
```
1. Validate args: if jobId && opts.last → print error, exit 1
2. If opts.last && !jobId:
   a. getLastFailedJob(db)
   b. If null → "Error: no failed jobs found", exit 1
   c. jobId = row.id
3. result = retryJob(db, jobId)
4. If result.reason === 'not_found' → "Error: job '<id>' not found", exit 1
5. If result.reason === 'wrong_state' → "Error: job '<id>' is not in a failed state (current status: <status>)", exit 1
6. Print "✓ Job <id> requeued (resuming from stage: <stage>)"
7. Exit 0
```

### Step 3: Register in `src/cli/index.js`

```js
import { retryFailedJob } from './retry.js';

program
  .command('retry [job-id]')
  .description('Requeue a failed job for re-execution')
  .option('--last', 'Retry the most recently failed job')
  .action((jobId, opts) => {
    const db = openDbSafe();
    if (!db) { console.error('Error: no database found. Run cockpit init first.'); process.exit(1); }
    retryFailedJob(db, jobId, opts);
    db.close();
  });
```

### Step 4: Tests

**`test/unit/db.test.js`** — add to existing `describe` block:
- `retryJob` on a failed job → returns success, status becomes `queued`, stage preserved, error null, rate_limit_count 0
- `retryJob` on a non-existent ID → `{ success: false, reason: 'not_found' }`
- `retryJob` on a queued/running/completed job → `{ success: false, reason: 'wrong_state' }`
- `getLastFailedJob` with multiple failed jobs → returns most recently updated
- `getLastFailedJob` with no failed jobs → returns null

**`test/unit/retry.test.js`** — new file:
- `cockpit retry <id>` success path → stdout contains job ID and stage, exit 0
- `cockpit retry <nonexistent>` → stderr contains "not found", exit 1
- `cockpit retry <running-job-id>` → stderr contains "not in a failed state", exit 1
- `cockpit retry --last` with a failed job → correct job retried, exit 0
- `cockpit retry --last` with no failed jobs → "no failed jobs found", exit 1
- `cockpit retry <id> --last` → "cannot specify both", exit 1

## Complexity Tracking

*(No constitution violations — no entry needed)*
