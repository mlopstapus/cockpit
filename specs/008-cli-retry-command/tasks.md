# Tasks: CLI Retry Command

**Input**: Design documents from `/specs/008-cli-retry-command/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/cli-retry.md ✓

**Tests**: Required per constitution Principle IV (Test-Driven Implementation). Tests must be written before or alongside implementation. All tests must pass before creating a PR.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to ([US1], [US2])

---

## Phase 1: Setup

**Purpose**: No new project or dependencies are required — all needed packages are already in-tree. This phase confirms the working surface before implementation begins.

- [x] T001 Verify existing src/db/jobs.js exports and src/cli/ module pattern by reading both files; confirm no existing `retryJob`, `getLastFailedJob`, or `cockpit retry` registration exists

---

## Phase 2: Foundational (DB Layer)

**Purpose**: Both user stories depend on the DB functions. Implement and test them first.

**⚠️ CRITICAL**: No CLI work can begin until T002–T005 are complete.

- [x] T002 Write failing unit tests for `retryJob` and `getLastFailedJob` in `test/unit/db.test.js` — cover: success path, not-found, wrong-state (queued/active/completed/cancelled/rate_limited), rate_limit_count reset, stage preservation, null-stage fallback (job with stage=null treated as `idle`), `getLastFailedJob` ordering by updated_at DESC, `getLastFailedJob` returns null when no failed jobs
- [x] T003 Implement `retryJob(db, id)` in `src/db/jobs.js` — UPDATE WHERE status='failed': set status='queued', error=NULL, rate_limit_count=0, rate_limit_reset_at=NULL, updated_at=now; return `{ success, reason, job }` based on changes count; distinguish not_found vs wrong_state via prior SELECT
- [x] T004 Implement `getLastFailedJob(db)` in `src/db/jobs.js` — SELECT WHERE status='failed' ORDER BY updated_at DESC LIMIT 1; return row or null
- [x] T005 Run `npm test -- --test-name-pattern "retryJob|getLastFailedJob"` and confirm all db tests pass

**Checkpoint**: DB functions complete and tested — CLI implementation can begin

---

## Phase 3: User Story 1 — Retry a Failed Job by ID (Priority: P1) 🎯 MVP

**Goal**: `cockpit retry <job-id>` requeues a specific failed job, resuming from the failed stage.

**Independent Test**: Create a failed job in a temp SQLite DB, run `cockpit retry <job-id>` via the CLI module, confirm status='queued' stage preserved error=null exit-code=0.

### Tests for User Story 1

> **NOTE: Write these tests FIRST — ensure they FAIL before implementing retry.js**

- [x] T006 [US1] Write failing CLI unit tests for US1 paths in `test/unit/retry.test.js` — cover: success confirmation includes job ID and stage name, exit 0; unknown ID → stderr "not found" exit 1; non-failed status (active/completed) → stderr "not in a failed state" with current status, exit 1; no DB → stderr "no database found" exit 1; no running daemon required — verify retry succeeds with daemon stopped (FR-010)

### Implementation for User Story 1

- [x] T007 [US1] Create `src/cli/retry.js` exporting `retryFailedJob(db, jobId, opts)` — validate args (conflict check deferred to US2), call `retryJob`, handle not_found/wrong_state errors with process.exit(1), print `✓ Job <id> requeued (resuming from stage: <stage>)` on success
- [x] T008 [US1] Register `cockpit retry [job-id]` subcommand in `src/cli/index.js` — import `retryFailedJob` from `./retry.js`, add `.command('retry [job-id]')` with description, open DB via `openDbSafe()`, call `retryFailedJob`, close DB; add `--last` option stub (value unused until US2)
- [x] T009 [US1] Run `npm test` and confirm all db.test.js and retry.test.js tests pass for US1 paths

**Checkpoint**: `cockpit retry <job-id>` is fully functional and independently testable

---

## Phase 4: User Story 2 — Retry the Most Recently Failed Job (Priority: P2)

**Goal**: `cockpit retry --last` resolves and requeues the most recently failed job without requiring the operator to know its ID.

**Independent Test**: Create two failed jobs with different updated_at, run `cockpit retry --last`, confirm the more-recently-updated job is requeued and its ID appears in stdout.

### Tests for User Story 2

> **NOTE: Write these tests FIRST — ensure they FAIL before extending retry.js**

- [x] T010 [US2] Add failing CLI tests for `--last` paths in `test/unit/retry.test.js` — cover: `--last` with one failed job → correct job ID in output, exit 0; `--last` with multiple failed jobs → most recently updated selected; `--last` with no failed jobs → stderr "no failed jobs found" exit 1; both `<job-id>` and `--last` supplied → stderr "cannot specify both" exit 1

### Implementation for User Story 2

- [x] T011 [US2] Extend `src/cli/retry.js` with `--last` logic — if both jobId and opts.last are set: print error "cannot specify both a job ID and --last", exit 1; if opts.last and no jobId: call `getLastFailedJob`, if null print "no failed jobs found" exit 1, else set jobId from result; then proceed with existing `retryJob` call
- [x] T012 [US2] Run `npm test` and confirm all retry.test.js tests pass including `--last` paths

**Checkpoint**: Both user stories complete and independently testable

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T013 Run full test suite `npm test` and fix any failures; run `npm run lint` if available and fix lint errors
- [x] T014 [P] Update `CLAUDE.md` Recent Changes section to note 008-cli-retry-command: adds `cockpit retry <job-id>` and `cockpit retry --last` subcommands with resume-from-failed-stage behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on T001 — **BLOCKS Phases 3 and 4**
- **Phase 3 (US1)**: Depends on Phase 2 completion (T005 must pass)
- **Phase 4 (US2)**: Depends on Phase 3 completion (T009 must pass) — `--last` extends the same CLI module
- **Phase 5 (Polish)**: Depends on Phases 3 and 4

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on US2
- **US2 (P2)**: Depends on US1 (`src/cli/retry.js` already exists; US2 extends it)

### Within Each User Story

- Tests written first (FAIL), then implementation (PASS)
- DB functions before CLI module
- CLI module before index.js registration

### Parallel Opportunities

- T003 and T004 target different exports in the same file — implement sequentially within Phase 2
- T006 (write tests) and later T010 (write --last tests) are in the same test file — sequential within their phases
- T013 (full test run) and T014 (CLAUDE.md update) are in different files — can run in parallel

---

## Parallel Example: Phase 2

```bash
# Phase 2 is sequential (same file: src/db/jobs.js)
Task: T002 — Write failing tests first
Task: T003 — Implement retryJob
Task: T004 — Implement getLastFailedJob
Task: T005 — Confirm tests pass
```

## Parallel Example: Phase 5

```bash
# Phase 5 — parallel opportunities
Task: T013 — Full test suite + lint
Task: T014 — CLAUDE.md update (different file)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational DB layer (T002–T005)
3. Complete Phase 3: US1 — retry by ID (T006–T009)
4. **STOP and VALIDATE**: `cockpit retry <job-id>` works end-to-end
5. Ship MVP if needed

### Incremental Delivery

1. Complete Phases 1–3 → `cockpit retry <job-id>` ships
2. Add Phase 4 → `cockpit retry --last` ships
3. Phase 5 polish → PR ready

---

## Notes

- No new npm packages required
- No schema migrations — all columns already exist in `jobs` table
- The daemon does not need to be running for any test or for the command itself
- Stage is **preserved** on retry (key clarification) — tests must assert stage field is unchanged after retry
- `rate_limit_count` must be reset to 0 on retry — tests must cover this
