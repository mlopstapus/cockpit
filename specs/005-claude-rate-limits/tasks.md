# Tasks: Claude Rate Limit Handling

**Input**: Design documents from `/specs/005-claude-rate-limits/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Included per project constitution Principle IV (Test-Driven Implementation). Tests must be written and run alongside implementation. All tests must pass before the PR is created.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Create the new source file; no structural changes to the project required.

- [X] T001 Create empty module file `src/process/rate-limit-detector.js` (ESM, exports placeholder functions detectRateLimit and formatResetMessage)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes, new DB functions, detector implementation, and output-capture fix. All US phases depend on this phase being complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema

- [X] T002 Add `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rate_limit_reset_at TEXT` and `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rate_limit_count INTEGER NOT NULL DEFAULT 0` to `openDb()` in `src/db/index.js` (add after the existing `CREATE TABLE IF NOT EXISTS` block)

### Rate Limit Detector Module

- [X] T003 [P] Implement `detectRateLimit(output)` in `src/process/rate-limit-detector.js` — scan output string for rate-limit indicator phrases (`"claude ai usage limit reached"`, `"usage limit reached"`, `"rate limit exceeded"`, `"api usage limit"`) and extract reset timestamp via three patterns in priority order: ISO 8601, Unix epoch after "reset" keyword, time string after "resets at"; return `{ isRateLimit: boolean, resetAt: Date|null }`
- [X] T004 Implement `formatResetMessage(resetAt, fallbackMinutes = 60)` in `src/process/rate-limit-detector.js` — return human-readable string: if resetAt known: `"Rate limit hit — resets at HH:MM UTC (in approximately N minutes). Pipeline will resume automatically."`; if null: `"Rate limit hit — reset time unknown. Waiting 60 minutes (fallback). Pipeline will resume automatically."`
- [X] T005 [P] Write unit tests for `detectRateLimit` and `formatResetMessage` in `test/rate-limit-detector.test.js` — cover: ISO 8601 timestamp extracted, Unix epoch extracted, time-string extracted, phrase found but no timestamp (resetAt null), normal error returns isRateLimit false, formatResetMessage with known date, formatResetMessage with null

### New DB Functions

- [X] T006 Add `markRateLimited(db, id, resetAt, newCount)` to `src/db/jobs.js` — UPDATE jobs SET status='rate_limited', rate_limit_reset_at=resetAt, rate_limit_count=newCount, updated_at=now WHERE id=id
- [X] T007 Add `requeueExpiredRateLimited(db)` to `src/db/jobs.js` — UPDATE jobs SET status='queued', rate_limit_reset_at=NULL, updated_at=now WHERE status='rate_limited' AND (rate_limit_reset_at IS NULL OR rate_limit_reset_at <= now); return count of rows updated
- [X] T008 [P] Add `listRateLimited(db)` to `src/db/jobs.js` — SELECT * FROM jobs WHERE status='rate_limited' ORDER BY updated_at DESC
- [X] T009 [P] Write unit tests for `markRateLimited`, `requeueExpiredRateLimited`, and `listRateLimited` in `test/jobs.test.js` — cover: markRateLimited sets correct fields, requeueExpiredRateLimited requeues jobs with past reset time, requeueExpiredRateLimited ignores jobs with future reset time, requeueExpiredRateLimited requeues null-resetAt jobs, listRateLimited returns only rate_limited rows

### Output Capture Fix

- [X] T010 Attach accumulated output to the rejected Error in `runClaudeStage` in `src/daemon/stage-executor.js` — in the `proc.on('close', (code) => {...})` handler, before calling `reject`, create `const error = new Error(...)` then set `error.output = output` and pass error to reject instead of `new Error(...)` inline; add test in `test/stage-executor.test.js` verifying `err.output` contains stdout text on non-zero exit

**Checkpoint**: Foundation complete — detector module, DB functions, schema changes, and output-capture fix all in place. User story phases can now proceed.

---

## Phase 3: User Story 1 — Pipeline Pauses on Rate Limit and Resumes Automatically (P1) 🎯 MVP

**Goal**: When Claude hits a rate limit mid-stage, Cockpit detects it, posts a GitHub comment with stage + reset time, persists the wait state to SQLite, and automatically resumes the interrupted stage after the reset time passes.

**Independent Test**: Inject a mock Claude spawn that exits non-zero with a rate-limit message containing a future ISO timestamp; verify (1) job status becomes `rate_limited`, (2) `rate_limit_reset_at` is set to the extracted time, (3) a GitHub comment is posted containing the stage name and reset time, (4) after `requeueExpiredRateLimited` is called with a mocked "now" past the reset time the job status becomes `queued`, and (5) the next dequeue runs the same stage.

### Tests for User Story 1

- [X] T011 [P] [US1] Write tests for rate-limit detection in `executeJob` catch block in `test/stage-executor.test.js` — cover: (1) rate-limit exit sets status to `rate_limited` and correct `rate_limit_reset_at`; (2) GitHub comment body contains stage label and reset time; (3) when no timestamp in output the comment body contains the fallback phrase (e.g. "60 minutes") and status is still `rate_limited` (FR-008, SC-005); (4) `job.stage` column is unchanged after `markRateLimited` — same stage is preserved for resume (FR-005); (5) `appendLog` is called with a message containing the stage name and resume-at timestamp (FR-006); (6) non-rate-limit error still calls `markFailed` and does not call `markRateLimited`

### Implementation for User Story 1

- [X] T012 [US1] Import `detectRateLimit`, `formatResetMessage` from `src/process/rate-limit-detector.js` and `markRateLimited` from `src/db/jobs.js` into `src/daemon/stage-executor.js`
- [X] T013 [US1] Add rate-limit handling block inside the `catch (err)` clause of `executeJob` in `src/daemon/stage-executor.js` — read `err.output || ''`; call `detectRateLimit`; if `isRateLimit` is true: read `job.rate_limit_count || 0`, skip to terminal-failure path only if count >= 3 (handled in US3), otherwise compute `resumeAt = resetAt ?? new Date(Date.now() + RATE_LIMIT_FALLBACK_MS)`, call `markRateLimited(db, job.id, resumeAt.toISOString(), count + 1)`, post GitHub comment using `formatResetMessage`, log the event, return early (do not call `markFailed`); add constant `const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000` near top of file
- [X] T014 [US1] Import `requeueExpiredRateLimited` from `src/db/jobs.js` into `src/daemon/poller.js` and call it at the top of the poll loop body (before the repo-polling loop); log count of requeued jobs when count > 0

**Checkpoint**: User Story 1 fully functional — rate-limit events pause the job, comment is posted, job auto-resumes after reset time. Run `npm test` to confirm.

---

## Phase 4: User Story 2 — Operator Visibility Into Waiting State (P2)

**Goal**: `cockpit status` displays rate-limited jobs with their reset time and retry count; log entries record each rate-limit event.

**Independent Test**: Call `showStatus` with a DB that has a `rate_limited` job; verify the output string contains the job ID, stage, reset time, and retry attempt count. Confirm the log entry for the rate-limit event was written by T013.

### Tests for User Story 2

- [X] T015 [P] [US2] Write test for `showStatus` in `test/daemon-control.test.js` — insert a `rate_limited` job into an in-memory DB, call `showStatus`, assert console output contains `"Waiting (rate-limited)"`, the job ID, and the resume time

### Implementation for User Story 2

- [X] T016 [US2] Import `listRateLimited` from `src/db/jobs.js` into `src/cli/daemon-control.js` and add display block in `showStatus` — after the active-jobs block, call `listRateLimited(db)` and for each result print: `Waiting (rate-limited): <id> (<spec_name>) — stage: <stage> — resumes: <formatted time> — attempt <rate_limit_count>/3`; format `rate_limit_reset_at` with `toLocaleTimeString()` or `'unknown'` if null

**Checkpoint**: User Story 2 functional — `cockpit status` shows paused jobs. User Stories 1 and 2 both independently verified. Run `npm test`.

---

## Phase 5: User Story 3 — Multiple Rate Limits and Retry Cap (P3)

**Goal**: Up to 3 rate-limit events per job are handled independently. On the 4th hit, the job is permanently failed with a descriptive terminal error and a GitHub comment.

**Independent Test**: Run a mock job that returns rate-limit output 4 times in succession; verify the first 3 result in `rate_limited` status with incrementing `rate_limit_count`, and the 4th results in `failed` status with a message mentioning "retry limit" and a corresponding GitHub comment.

### Tests for User Story 3

- [X] T017 [P] [US3] Add tests for retry cap in `test/stage-executor.test.js` — cover: 3rd rate-limit hit sets `rate_limit_count = 3` and status `rate_limited`; 4th rate-limit hit calls `markFailed` with retry-limit message and posts terminal GitHub comment; `rate_limit_count` increments correctly across retries

### Implementation for User Story 3

- [X] T018 [US3] Extend the rate-limit handling block added in T013 in `src/daemon/stage-executor.js` to handle the terminal case: when `(job.rate_limit_count || 0) + 1 > 3`, call `markFailed(db, job.id, 'Rate limit retry limit reached (3 attempts)')`, post GitHub comment `"❌ Rate limit retry limit reached (3/3). Pipeline cannot continue — please re-open the issue once your Anthropic usage limit resets."`, log the terminal failure, and return without calling `markRateLimited`
- [X] T018b [US3] Verify manual-stop edge case: confirm that when `cockpit stop` is issued while a job has `status = 'rate_limited'`, the job row is NOT left in `rate_limited` state on next daemon start — the existing `requeueInterrupted` only touches `active` rows, so `rate_limited` jobs survive restart and resume correctly via `requeueExpiredRateLimited`; document this behaviour with a comment in `src/daemon/index.js` near the startup `requeueInterrupted` call

**Checkpoint**: All three user stories functional. Rate limits handled gracefully up to 3 times; 4th hit terminates permanently. Run `npm test`.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Verify that `requeueInterrupted` in `src/db/jobs.js` does NOT requeue `rate_limited` jobs on daemon restart (it should only requeue `active` → `queued`; `rate_limited` jobs are handled separately by `requeueExpiredRateLimited`); add a test in `test/jobs.test.js` asserting `requeueInterrupted` leaves `rate_limited` rows untouched
- [X] T020 [P] Run full test suite with `npm test` and fix any failing tests
- [X] T021 [P] Run `node --check src/process/rate-limit-detector.js src/daemon/stage-executor.js src/daemon/poller.js src/db/jobs.js src/db/index.js src/cli/daemon-control.js` to verify no syntax errors
- [X] T022 Add `005-claude-rate-limits: Added rate limit detection, graceful pause/resume, and retry cap` to the `## Recent Changes` section of `CLAUDE.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion; independent of US1 but logically follows it
- **User Story 3 (Phase 5)**: Depends on Phase 3 (T013 provides the block US3 extends)
- **Polish (Phase 6)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Phase 2 — no dependency on US2 or US3
- **US2 (P2)**: Can start immediately after Phase 2 — independent of US1
- **US3 (P3)**: Extends the catch-block code written in T013 (US1) — start after T013 completes

### Within Each Phase

- T002, T003, T006+T007+T008 can all start in parallel (different files); T004 must follow T003 (same file)
- T005, T009 depend on T003 and T006 respectively
- T010 depends on nothing but touches stage-executor.js — complete before T012

### Parallel Opportunities

- T002 (db/index.js) || T003 (rate-limit-detector.js — detectRateLimit) || T006+T007+T008 (db/jobs.js) — all different files; T004 (formatResetMessage, same file as T003) must follow T003
- T005 (test/rate-limit-detector) || T009 (test/jobs.test.js) — both test files, independent
- T011 (test) || T012 (imports) — T012 can be written before T013 is complete
- T015 (test/daemon-control) || T016 (daemon-control.js) — test-first approach

---

## Parallel Example: Phase 2 Foundational

```bash
# These three groups touch different files — launch together:
Task: T002 — src/db/index.js (schema ALTER TABLE)
Task: T003 — src/process/rate-limit-detector.js (detectRateLimit)
# Then sequentially: T004 — src/process/rate-limit-detector.js (formatResetMessage, same file)
Task: T006+T007+T008 — src/db/jobs.js (three new DB functions)

# Then in parallel once their dependencies are done:
Task: T005 — test/rate-limit-detector.test.js (depends on T003+T004)
Task: T009 — test/jobs.test.js (depends on T006+T007+T008)
Task: T010 — src/daemon/stage-executor.js output capture fix (independent)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T010)
3. Complete Phase 3: User Story 1 (T011–T014)
4. **STOP and VALIDATE**: `npm test` — rate-limit pause + resume works end-to-end
5. Proceed to US2 and US3

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 (US1) → Graceful pause and auto-resume — **ship this as MVP**
3. Phase 4 (US2) → Operator visibility in `cockpit status`
4. Phase 5 (US3) → Retry cap and terminal failure path
5. Phase 6 → Polish, test suite, CLAUDE.md update

---

## Notes

- `[P]` tasks touch different files and have no inter-dependencies — safe to run concurrently
- `[Story]` label maps each task to a user story for traceability
- Constitution Principle IV: write tests alongside implementation, confirm red before green
- Do not merge until `npm test` passes completely
- The `RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000` constant in stage-executor.js is the single source of truth for the fallback wait
- `requeueExpiredRateLimited` is idempotent — calling it multiple times in a cycle is safe
- **Retry count semantics**: "cap at 3 retries" means 3 `rate_limited` pauses are allowed; the 4th rate-limit occurrence (when `rate_limit_count` would reach 4) triggers permanent failure. In code: `if ((job.rate_limit_count || 0) + 1 > 3) → markFailed`. The first hit sets count to 1, second to 2, third to 3 (all `rate_limited`); fourth triggers failure.
