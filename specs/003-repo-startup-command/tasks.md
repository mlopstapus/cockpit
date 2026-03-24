# Tasks: Repo Startup Commands

**Input**: Design documents from `/specs/003-repo-startup-command/`
**Branch**: `003-repo-startup-command`
**Date**: 2026-03-24

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/cli-contract.md ✅ | quickstart.md ✅

**Tests**: Included per constitution Principle IV (Test-Driven Implementation). Tests MUST be written before implementation and MUST fail before implementation begins.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify test infrastructure and read existing code before making changes.

No new project structure needed — all changes are additive modifications to existing files.

- [X] T001 Read `src/daemon/stage-executor.js` and `test/unit/stage-executor.test.js` to understand existing exec and test patterns before writing new code
- [X] T002 [P] Read `src/cli/repos.js` and `test/unit/repos.test.js` to understand existing CLI and test patterns
- [X] T003 [P] Run `npm test` to confirm baseline passes before any changes

**Checkpoint**: Test baseline confirmed — no regressions before work begins

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No new shared infrastructure needed for this feature. Config schema change is backward-compatible and handled in-place within each user story phase.

**⚠️ NOTE**: Phase 1 must complete before user story work begins (establishes baseline). All three user stories are then independently workable.

---

## Phase 3: User Story 1 — Configure Startup Command Per Repo (Priority: P1) 🎯 MVP

**Goal**: After implement stage completes, if the repo has a `startupCommand` configured, run it. If not, skip silently (backward compatible).

**Independent Test**: Add `startupCommand` to a repo entry in `~/.cockpit/config.json`, trigger a test run in `stage-executor`, and observe the command is executed. Repos without the field behave identically to before.

### Tests for User Story 1 (Write FIRST — must FAIL before implementation)

- [X] T004 [US1] Add unit tests to `test/unit/stage-executor.test.js`:
  - Test: runs startup command when `repoConfig.startupCommand` is set
  - Test: skips startup command when `startupCommand` is absent/undefined (backward compat)
  - Test: skips startup command when `startupCommand` is empty string
  - Test: runs startup command in `job.repo_path` as cwd
  - Test: runs startup command after global `postImplementCommand` block

### Implementation for User Story 1

- [X] T005 [US1] Add `runStartupCommand()` helper to `src/daemon/stage-executor.js`:
  - Accepts `{ command, repoPath, log }`
  - Runs `execFileAsync('/bin/sh', ['-c', command], { timeout: 300_000, cwd: repoPath })`
  - Returns `{ success, exitCode, outputSnippet, elapsedMs }`
  - Captures last 50 lines of combined stdout+stderr as `outputSnippet`
  - On timeout: returns `{ success: false, exitCode: null, outputSnippet: ..., elapsedMs }`

- [X] T006 [US1] Call `runStartupCommand()` in the implement-complete block of `src/daemon/stage-executor.js`:
  - Look up `repoConfig = config.repos.find(r => r.repo === job.github_repo)`
  - Guard with `if (repoConfig?.startupCommand)` — falsy = skip
  - Place AFTER existing `postImplementCommand` block (per research.md decision #4)
  - Log start/completion via `log()`

- [X] T007 [US1] Run `npm test` — all T004 tests must now pass; no regressions

**Checkpoint**: US1 complete — startup command runs after implement, absent config skips silently

---

## Phase 4: User Story 2 — Startup Command Result Reported in Issue (Priority: P2)

**Goal**: Every startup command execution (success or failure) produces a GitHub issue comment with the outcome and relevant output snippet.

**Independent Test**: Configure a startup command that exits 0 and one that exits 1; run jobs; verify issue comments contain ✅/⚠️ with correct output snippet.

### Tests for User Story 2 (Write FIRST — must FAIL before implementation)

- [X] T008 [US2] Add unit tests to `test/unit/stage-executor.test.js`:
  - Test: posts `✅ **Startup command completed**` comment on exit 0
  - Test: comment includes elapsed time and last 50 lines of output on success
  - Test: posts `⚠️ **Startup command failed** (exit 1)` comment on non-zero exit
  - Test: posts `⚠️ **Startup command failed** (exit timeout)` on timeout
  - Test: includes last 50 lines of stderr/output in failure comment
  - Test: failure comment does NOT mark job as failed — `markFailed` NOT called

### Implementation for User Story 2

- [X] T009 [US2] Extend `runStartupCommand()` in `src/daemon/stage-executor.js` (already created in T005) to post issue comment based on result:
  - On success: `postIssueComment(octokit, job.github_repo, job.issue_number, \`✅ **Startup command completed** (${elapsedS}s):\n\`\`\`\n${snippet}\n\`\`\`\`)`
  - On failure: `postIssueComment(octokit, job.github_repo, job.issue_number, \`⚠️ **Startup command failed** (exit ${exitCode || 'timeout'}):\n\`\`\`\n${snippet}\n\`\`\`\`)`
  - Both `.catch(() => {})` — comment failure must not surface as job failure
  - Startup command failure does NOT call `markFailed` — implement succeeded

- [X] T010 [US2] Run `npm test` — all T008 tests must now pass; T004–T007 must still pass

**Checkpoint**: US2 complete — every startup command run produces a GitHub issue comment

---

## Phase 5: User Story 3 — Add/Update Startup Command via CLI (Priority: P3)

**Goal**: `cockpit repos add <owner/repo> <path> [--startup-command <cmd>]` stores the command in config; if the repo already exists, `--startup-command` updates the field in-place.

**Independent Test**: Run `cockpit repos add testowner/testrepo /some/path --startup-command "echo hello"` and read `~/.cockpit/config.json` to verify `startupCommand` is set. Run again to verify update-in-place.

### Tests for User Story 3 (Write FIRST — must FAIL before implementation)

- [X] T011 [P] [US3] Add unit tests to `test/unit/repos.test.js`:
  - Test: `repoAdd` with `options.startupCommand` stores field in config
  - Test: `repoAdd` without `options.startupCommand` stores repo with no `startupCommand` field (backward compat)
  - Test: `repoAdd` on existing repo with `options.startupCommand` updates field in-place without removing repo
  - Test: `repoAdd` on existing repo without `options.startupCommand` warns and exits (existing behavior)
  - Test: command with spaces and special chars is stored verbatim

### Implementation for User Story 3

- [X] T012 [US3] Update `repoAdd()` signature in `src/cli/repos.js`:
  - Change from `repoAdd(configDir, repoName, localPath, logger)` to `repoAdd(configDir, repoName, localPath, options = {}, logger)`
  - Store `startupCommand` on new repo entry: `{ repo: repoName, localPath, ...(options.startupCommand ? { startupCommand: options.startupCommand } : {}) }`
  - On existing repo: if `options.startupCommand` provided, update entry in-place and save; else warn and return (existing behavior)

- [X] T013 [US3] Add `--startup-command <cmd>` option to `repos add` command in `src/cli/index.js`:
  - `.option('--startup-command <cmd>', 'shell command to run after implement stage')`
  - Pass `opts.startupCommand` as `options.startupCommand` to `repoAdd()`

- [X] T014 [P] [US3] Update `repoList()` in `src/cli/repos.js` to display startup command when set:
  - Append `  startup: <cmd>` to line when `r.startupCommand` is truthy

- [X] T015 [US3] Run `npm test` — all T011 tests must now pass; T004–T010 must still pass

**Checkpoint**: US3 complete — startup command configurable via CLI

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation.

- [X] T016 [P] Update `CLAUDE.md` config reference table to document `startupCommand` per-repo field with description "optional shell command run after implement stage (5-min timeout)"
- [X] T017 Run full `npm test` suite — all tests must pass
- [X] T018 Run `npm run lint` — no lint errors (eslint not installed in project)
- [X] T019 [P] Validate quickstart.md test scenarios against implementation manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Skipped — no blocking prerequisites
- **Phase 3 (US1, P1)**: Depends on Phase 1 — BLOCKS Phase 4 (US2 extends US1's function)
- **Phase 4 (US2, P2)**: Depends on Phase 3 (extends `runStartupCommand()`)
- **Phase 5 (US3, P3)**: Independent of Phase 3/4 — can run in parallel after Phase 1
- **Phase 6 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: After Phase 1 — no story dependencies
- **US2 (P2)**: After US1 — extends same function in stage-executor.js
- **US3 (P3)**: After Phase 1 — independent of US1/US2 (different file: repos.js)

### Within Each User Story

- Tests written and failing BEFORE implementation
- `runStartupCommand()` helper before calling it (T005 before T006)
- `repoAdd()` logic before CLI wiring (T012 before T013)

---

## Parallel Execution Examples

### US1 + US3 in parallel (after Phase 1)

```
Agent A: T004 → T005 → T006 → T007 (stage-executor)
Agent B: T011 → T012 → T013 → T014 → T015 (repos + CLI)
```

### Within US3

```
T011 (tests) and T014 (repoList display) can run in parallel — different functions
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline verified)
2. Complete Phase 3 (US1): startup command runs, skip when absent
3. **STOP and VALIDATE**: manually test with a real repo config
4. Continue to Phase 4 (US2) for reporting

### Full Incremental Delivery

1. Phase 1 → baseline
2. Phase 3 (US1) → execution works
3. Phase 4 (US2) → reporting works → **shippable**
4. Phase 5 (US3) → CLI flag → **complete**
5. Phase 6 → polish → PR

### Parallel Strategy (single agent, sequential tasks)

Run US3 immediately after Phase 1 while US1/US2 are in progress — different files, zero conflict.

---

## Notes

- [P] = different files, no dependencies on each other
- Tests for US1 and US2 are both in `stage-executor.test.js` — write US1 tests, implement, then add US2 tests, implement
- US3 tests are in `repos.test.js` — fully independent of the others
- The `runStartupCommand()` function evolves across US1 and US2: US1 adds execution/result; US2 adds comment posting
- Startup command failure must NEVER mark a job as failed — implement succeeded; startup is best-effort
- Backward compatibility is non-negotiable: existing repos (no `startupCommand`) must behave identically
