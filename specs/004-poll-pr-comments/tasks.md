# Tasks: Poll PR Comments & Implement Changes

**Input**: Design documents from `/specs/004-poll-pr-comments/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The single gap between existing code and this feature — extend the PR review CRUD module before any executor logic can be written.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Extend `src/db/pr-reviews.js`: add `markPrReviewComplete(db, id)` (UPDATE status='completed'), `markPrReviewFailed(db, id)` (alias for reset to queued — post failure comment is the executor's job, not the DB layer's), and `resetPrReviewToQueued(db, id)` (UPDATE status='queued' — used for all retry cases)

**Checkpoint**: DB CRUD layer complete — all other phases can now begin.

---

## Phase 2: User Story 1 — Core Comment→Implementation Loop (Priority: P1) 🎯 MVP

**Goal**: A single reviewer comment from `githubOwner` on a Cockpit PR triggers: acknowledgement comment → Claude implements change → git push → success comment posted.

**Independent Test**: Create a PR via Cockpit in a test repo; post one comment as `githubOwner`; verify acknowledgement appears, a commit is pushed, and success comment appears. Run `npm test` to confirm unit tests pass.

### Tests for User Story 1 (MANDATORY — constitution Principle IV)

> **Write these tests FIRST; confirm they FAIL before implementation**

- [x] T002 [P] [US1] Write `test/unit/pr-watcher.test.js`: stubs `listActivePrs`, `listPRComments`, `octokit.pulls.get`; asserts that a new comment from `githubOwner` calls `markPrCommentSeen` and `enqueuePrReview`; asserts that a bot-emoji comment is ignored; asserts that a non-owner comment is ignored; asserts that a merged PR calls `deregisterPr`
- [x] T003 [P] [US1] Write `test/unit/pr-review-executor.test.js`: stubs `dequeuePrReview`, `postPRComment`, Claude spawn, `execFile` (git push), `markPrReviewComplete`, `resetPrReviewToQueued`; asserts acknowledgement comment posted before Claude runs; asserts push executed after Claude exits 0; asserts success comment posted; asserts failure comment posted and `resetPrReviewToQueued` called when Claude exits non-zero; asserts `RateLimitError` causes reset and rethrow without posting a comment

### Implementation for User Story 1

- [x] T004 [US1] Implement `src/github/pr-watcher.js`: export `pollActivePr(octokit, db, pr, githubOwner)` — fetch PR state via `octokit.pulls.get` (deregister and return if closed/merged); call `listPRComments`; filter to comments where `comment.user.login === githubOwner` AND body does not start with `👀|✅|❌|⚠️|🎉|🚀|💬`; for each new comment not in `isPrCommentSeen`: sanitize body (strip control characters except newlines, same pattern as `sanitizeBody` in `src/github/watcher.js`) then call `markPrCommentSeen` and collect into batch; if batch is non-empty, call `enqueuePrReview` with joined `comment_body` and first comment's `comment_id`
- [x] T005 [US1] Implement `src/daemon/pr-review-executor.js`: export `executePrReview(db, review, octokit, config, opts)` — post `👀 Received comment(s) — implementing now…` via `postPRComment`; spawn Claude with `-p <comment_body>` in `review.repo_path` (new session, no `--continue`, same spawn pattern as `stage-executor.js`); stream output to logs; on Claude exit 0: run `git add -A && git commit -m "Apply PR review feedback" && git push` via `execFile`; on success: post `✅ Changes pushed to branch` and call `markPrReviewComplete`; on any non-rate-limit error: post `❌ Implementation failed: <reason>. Will retry next cycle.` and call `resetPrReviewToQueued`; on `RateLimitError`: call `resetPrReviewToQueued` silently and re-throw
- [x] T006 [US1] Modify `src/daemon/poller.js`: after the existing `pollRepo` loop, add a loop over `listActivePrs(db)` calling `pollActivePr(octokit, db, pr, config.githubOwner)` for each (handle `RateLimitError` same as issue polling — sleep + break); after `runNextJob`, define and call `runNextPrReview(db, octokit, config)` inline in `poller.js` for now (dequeue one PR review job via `dequeuePrReview` and call `executePrReview`, catch/log errors — same pattern as `runNextJob`; T015 will optionally move this to `job-runner.js`)
- [x] T007 [US1] Run `npm test` — confirm all T002 and T003 tests pass and existing tests remain green

**Checkpoint**: US1 complete — single comment triggers full implement+push cycle. Manually verify with quickstart.md steps 1–5.

---

## Phase 3: User Story 2 — Batch Multiple Comments (Priority: P2)

**Goal**: Multiple comments posted before the next poll cycle are all acknowledged in one message, implemented in a single Claude pass, and pushed once.

**Independent Test**: Post three comments on a Cockpit PR before the next poll cycle; verify a single `👀` comment references all three; verify a single commit covers all changes. Run `npm test`.

### Tests for User Story 2 (MANDATORY — constitution Principle IV)

> **Add these cases to existing test files**

- [x] T008 [P] [US2] Add batch test cases to `test/unit/pr-watcher.test.js`: 3 new comments in a single poll → `enqueuePrReview` called exactly once; `comment_body` contains all 3 bodies joined; `markPrCommentSeen` called 3 times
- [x] T009 [P] [US2] Add batch acknowledgement test to `test/unit/pr-review-executor.test.js`: `review.comment_body` containing multiple lines → acknowledgement message says "Received 3 comment(s)" (count derived from newline-separated bodies)

### Implementation for User Story 2

- [x] T010 [US2] Update `src/github/pr-watcher.js`: ensure batch collection joins all comment bodies with `\n\n---\n\n` separator and passes total count in the enqueued job; no change to `enqueuePrReview` call count (still one per poll cycle per PR)
- [x] T011 [US2] Update `src/daemon/pr-review-executor.js`: parse comment count from `comment_body` (count `---` separators + 1) and include in acknowledgement message: `👀 Received N comment(s) — implementing now…`
- [x] T012 [US2] Run `npm test` — confirm T008 and T009 pass alongside all prior tests

**Checkpoint**: US2 complete — multiple comments batched correctly.

---

## Phase 4: User Story 3 — Idle Behavior When No New Comments (Priority: P3)

**Goal**: When no unaddressed comments exist, Cockpit polls silently and takes no action. When a new comment appears after a quiet period, it is processed normally.

**Independent Test**: Run `npm test` confirming the no-op path is covered. Manually confirm no extra commits or bot comments appear on a PR with no pending comments during a poll window.

### Tests for User Story 3 (MANDATORY — constitution Principle IV)

- [x] T013 [P] [US3] Add idle test cases to `test/unit/pr-watcher.test.js`: all comments already in `seen_pr_comments` → `enqueuePrReview` NOT called; empty comments array → `enqueuePrReview` NOT called; PR state 'open' with no new comments → no `deregisterPr` call
- [x] T014 [US3] Run `npm test` — confirm T013 passes

**Checkpoint**: All three user stories complete. Full poll loop covers detect → acknowledge → implement → push → idle → detect cycle.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T015 [P] Add `runNextPrReview` helper function to `src/daemon/job-runner.js` (or a new `src/daemon/pr-job-runner.js`): mirrors `runNextJob` pattern — `dequeuePrReview` → `executePrReview` → catch/log errors — keeping poller.js thin
- [x] T016 [P] Add log output to `src/github/pr-watcher.js` at key points: "PR comment poll: found N new comment(s) on PR #X", "PR #X merged/closed — deregistering" — to match quickstart.md expected log format
- [x] T017 [P] Verify `src/daemon/stage-executor.js` `isHumanComment` and the new pr-watcher bot-filter share the same emoji set — extract shared constant `BOT_COMMENT_PREFIXES` to `src/github/commenter.js` if they diverge
- [x] T018 Run `npm run lint` — fix any ESLint errors
- [x] T019 Run `npm test` — all tests green (final gate)
- [x] T020 Validate implementation against quickstart.md: confirm log messages match, failure scenarios behave as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on T001 (Foundational)
- **US2 (Phase 3)**: Depends on T007 (US1 complete)
- **US3 (Phase 4)**: Depends on T007 (US1 complete); can run in parallel with US2
- **Polish (Phase 5)**: Depends on T012 and T014 (all stories complete)

### User Story Dependencies

- **US1 (P1)**: Blocks US2 and US3 — core loop must exist before testing variations
- **US2 (P2)**: Extends US1 files; no new files; US3 can proceed concurrently
- **US3 (P3)**: Test-only additions to US1 test files; lightweight

### Within Each User Story

- Tests MUST be written first and confirmed FAILING before implementation tasks begin
- `pr-watcher.js` before `poller.js` integration (T004 before T006)
- `pr-review-executor.js` before `poller.js` integration (T005 before T006)
- T002 and T003 can be written in parallel (different test files)
- T004 and T005 can be written in parallel (different source files)

### Parallel Opportunities

- T002 ‖ T003 — different test files, no dependencies between them
- T004 ‖ T005 — different source files, no dependencies between them
- T008 ‖ T009 — different test files
- T013 ‖ T015 ‖ T016 ‖ T017 — all touch different files

---

## Parallel Example: User Story 1

```bash
# Write tests in parallel (after T001):
Task: "Write test/unit/pr-watcher.test.js"          # T002
Task: "Write test/unit/pr-review-executor.test.js"  # T003

# Implement modules in parallel (after confirming tests fail):
Task: "Implement src/github/pr-watcher.js"          # T004
Task: "Implement src/daemon/pr-review-executor.js"  # T005

# Wire together (after T004 + T005):
Task: "Modify src/daemon/poller.js"                 # T006
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 (foundational — 1 task)
2. Write US1 tests (T002, T003) — confirm FAIL
3. Implement US1 (T004, T005, T006)
4. **STOP and VALIDATE**: `npm test` passes; manual test via quickstart.md
5. US1 alone is a fully working PR comment review loop

### Incremental Delivery

1. T001 → Foundation ready
2. T002–T007 → US1: core loop working (MVP)
3. T008–T012 → US2: batching works
4. T013–T014 → US3: idle/closed-PR coverage complete
5. T015–T020 → Polish: lint, logs, shared constants, final gate

---

## Notes

- [P] tasks = different files, no cross-task dependencies at that point
- [Story] label maps each task to its user story for traceability
- **No new npm dependencies** — all existing packages (`better-sqlite3`, `@octokit/rest`, `node:child_process`) cover all needs
- **No new DB tables** — all three required tables (`active_prs`, `seen_pr_comments`, `pr_review_jobs`) exist in main branch schema
- The only net-new files are `src/github/pr-watcher.js`, `src/daemon/pr-review-executor.js`, and their test files
- Commit after each checkpoint (T007, T012, T014, T020)
