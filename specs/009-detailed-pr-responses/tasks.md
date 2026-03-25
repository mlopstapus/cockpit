# Tasks: Detailed PR Review Response Comments

**Input**: Design documents from `/specs/009-detailed-pr-responses/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Mandatory per constitution Principle IV. All tests use `node:test`. Run a single file with `node --test test/unit/pr-review-executor.test.js`. Run full suite with `npm test`.

**Organization**: Tasks grouped by user story. Only 2 files change: `src/daemon/pr-review-executor.js` (implementation) and `test/unit/pr-review-executor.test.js` (tests).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- File paths included in every task description

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the two pure helper functions that both user stories depend on. No tests yet — functions are small enough to be verified via the US1/US2 tests that follow.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add `extractChangesSection(output)` exported pure function to `src/daemon/pr-review-executor.js` — accepts a string (Claude's full stdout), matches regex `/## Changes Made\n([\s\S]*?)(?=\n## |\n# |$)/`, returns trimmed capture group or empty string if not found
- [x] T002 Add `buildSuccessComment(commentBody, changesSection)` exported pure function to `src/daemon/pr-review-executor.js` — returns a markdown string with heading `✅ **Changes pushed to branch**`, subheading `### What was addressed` containing `commentBody` as a blockquote (`> ` prefix per line), subheading `### What was changed` containing `changesSection` verbatim; when `changesSection` is empty substitutes `*No changes summary was generated.*`; if assembled string exceeds 8000 characters, truncates `changesSection` content with `… (truncated)` appended until total length ≤ 8000

**Checkpoint**: Both functions exported and syntactically valid — run `node --check src/daemon/pr-review-executor.js`

---

## Phase 3: User Story 1 — Reviewer Gets Summary (Priority: P1) 🎯 MVP

**Goal**: After a single PR review comment is processed, the success comment shows what was requested and what was changed — not just "Changes pushed to branch".

**Independent Test**: Run `node --test test/unit/pr-review-executor.test.js` with a mock Claude output that includes a `## Changes Made` section; verify the posted success comment contains "What was addressed" and "What was changed" headings and the original comment text.

### Tests for User Story 1 (write FIRST — verify they FAIL before T006/T007)

- [x] T003 [US1] Add `describe('extractChangesSection', ...)` block to `test/unit/pr-review-executor.test.js` with three `test()` cases: (a) section present mid-output — assert returned string equals content between `## Changes Made` and next `##` heading; (b) section absent — assert returns `''`; (c) section is last content in string (no trailing heading) — assert returns content through EOF
- [x] T004 [US1] Add `describe('buildSuccessComment', ...)` block to `test/unit/pr-review-executor.test.js` with two `test()` cases: (a) non-empty `changesSection` — assert output contains `### What was addressed`, blockquoted comment text, `### What was changed`, and changesSection content; (b) empty `changesSection` — assert output contains `*No changes summary was generated.*` and still contains `### What was addressed` with original comment text
- [x] T005 [US1] Update existing `describe('executePrReview — successful flow', ...)` test in `test/unit/pr-review-executor.test.js` — change `makeSpawnFn(0)` call to `makeSpawnFn(0, ['## Changes Made', '- Fixed error handling as requested'])` and add assertions that the `✅` success comment contains `What was addressed` and `What was changed` (not just `startsWith('✅')`)

### Implementation for User Story 1

- [x] T006 [US1] Modify the prompt string in `executePrReview` in `src/daemon/pr-review-executor.js` — append after the existing prompt body (before the closing backtick): `\n\nAt the end of your response, include a section headed exactly:\n\n## Changes Made\n\nList one bullet for each review comment you addressed, describing concisely what you changed. Do not include file names or line numbers — focus on what was wrong and what you fixed.`
- [x] T007 [US1] Wire `extractChangesSection` and `buildSuccessComment` into the success path of `executePrReview` in `src/daemon/pr-review-executor.js` — (a) change `runClaude(...)` call to capture its return value into `const claudeOutput`; (b) after the `await` resolves, call `const changesSection = extractChangesSection(claudeOutput)`; (c) replace the hardcoded string `\`✅ Changes pushed to branch\`` in the `postPRComment` call (line ~144) with `buildSuccessComment(review.comment_body, changesSection)`

**Checkpoint**: Run `node --test test/unit/pr-review-executor.test.js` — all T003/T004/T005 tests must pass. Job still completes and status is `completed`.

---

## Phase 4: User Story 2 — Multi-Comment Attribution (Priority: P2)

**Goal**: When multiple review comments are batched (separated by `\n\n---\n\n`), the success comment references each original comment and the "Changes Made" bullets address them individually.

**Independent Test**: Run `node --test test/unit/pr-review-executor.test.js` with a 3-section `comment_body` and mock Claude output with 3 `## Changes Made` bullets; verify the success comment blockquotes the full batched text and lists all 3 change bullets.

### Tests for User Story 2 (write FIRST — verify they FAIL before T010)

- [x] T008 [US2] Add `describe('buildSuccessComment — multi-comment batch', ...)` block to `test/unit/pr-review-executor.test.js` — use a `comment_body` of `'Fix error handling\n\n---\n\nAdd logging\n\n---\n\nUpdate README'` and a multi-bullet `changesSection`; assert the full batched comment text appears in the output (all three items) under `### What was addressed`
- [x] T009 [P] [US2] Add integration test to `test/unit/pr-review-executor.test.js` inside a new `describe('executePrReview — multi-comment success', ...)` — use `makeReview(db, { comment_body: 'Fix error handling\n\n---\n\nAdd logging' })` and `makeSpawnFn(0, ['## Changes Made', '- Fixed error handling', '- Added logging'])`, then assert `✅` comment contains `Fix error handling`, `Add logging`, and both change bullets

### Implementation for User Story 2

- [x] T010 [US2] Verify `buildSuccessComment` in `src/daemon/pr-review-executor.js` correctly blockquotes multi-line `comment_body` (each line prefixed with `> `, including separator lines) — adjust blockquoting logic if the US2 tests from T008/T009 fail due to `---` separator rendering

**Checkpoint**: Run `node --test test/unit/pr-review-executor.test.js` — all US2 tests pass. US1 tests still pass.

---

## Phase 5: Polish & Edge Cases

**Purpose**: Length guard, fallback path, and full regression check.

- [x] T011 [P] Add `describe('buildSuccessComment — length guard', ...)` to `test/unit/pr-review-executor.test.js` — pass a `changesSection` of `'x'.repeat(9000)` and assert output length ≤ 8000 and output contains `… (truncated)`
- [x] T012 [P] Add integration test `describe('executePrReview — fallback: no Changes Made section', ...)` to `test/unit/pr-review-executor.test.js` — use `makeSpawnFn(0, ['Implementation complete, no structured section'])` (no `## Changes Made` heading), assert `✅` comment contains original `comment_body` text and `*No changes summary was generated.*`, and job status is `completed`
- [x] T013 Run full test suite `npm test` — all tests across all files pass with no regressions
- [x] T014 [P] Run `node --check src/daemon/pr-review-executor.js` — no syntax errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T001, T002 complete)
- **User Story 2 (Phase 4)**: Depends on Phase 3 completion (T006, T007 must be in place)
- **Polish (Phase 5)**: Depends on Phase 3 and Phase 4 completion

### Within Each Phase

- Tests MUST be written and failing BEFORE implementation tasks
- T001 and T002 must run sequentially (same file — T002 follows T001)
- T003, T004, T005 (test writing) must run sequentially (all write to the same test file)
- T006 and T007 must run sequentially (T007 depends on T001/T002 exports)

### Parallel Opportunities

- T001 → T002 (Phase 2) — sequential; same source file
- T003 → T004 → T005 (Phase 3 tests) — sequential; same test file
- T011 ‖ T012 (Phase 5) — independent test cases (different describe blocks, can write in parallel)

---

## Parallel Example: Phase 3

```bash
# Write all Phase 3 tests sequentially (all in the same test file):
Task T003: Add extractChangesSection describe block
Task T004: Add buildSuccessComment describe block  [after T003]
Task T005: Update existing successful-flow test    [after T004]

# Run to confirm they FAIL:
node --test test/unit/pr-review-executor.test.js

# Then implement:
Task T006: Modify prompt
Task T007: Wire up extraction and comment builder

# Run to confirm they PASS:
node --test test/unit/pr-review-executor.test.js
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001, T002)
2. Complete Phase 3: User Story 1 (T003–T007)
3. **STOP and VALIDATE**: `node --test test/unit/pr-review-executor.test.js` — all pass
4. Deploy/demo: the enriched success comment is live

### Incremental Delivery

1. Phase 2 → Foundation ready (pure functions exported)
2. Phase 3 → US1 complete → MVP: single-comment enriched response
3. Phase 4 → US2 complete → Multi-comment attribution verified
4. Phase 5 → Polish: edge cases and full regression

---

## Notes

- Only 2 files change: `src/daemon/pr-review-executor.js` and `test/unit/pr-review-executor.test.js`
- Export `extractChangesSection` and `buildSuccessComment` so they can be directly unit tested (imported in test file)
- The existing `makeSpawnFn(exitCode, claudeLines)` helper already supports injecting mock Claude output — use `claudeLines` array to simulate `## Changes Made` section
- The existing `✅` success comment assertion in the "successful flow" test must be updated (T005) or it will still pass trivially after T007 since the new comment still starts with `✅`
- Existing failure flow tests (Claude exit non-zero, git push failure) require no changes — they never reach the success comment path
- `comment_body` is already stored in the review row; no DB queries needed to build the comment
