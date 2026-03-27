# Tasks: Init Preserve Config

**Input**: Design documents from `/specs/010-init-preserve-config/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Tests are MANDATORY per Constitution Principle IV. Pure helpers (`maskToken`) are unit-tested before implementation. Interactive wizard behavior is verified via acceptance scenarios in spec.md (mocking @clack/prompts is out of scope).

**Organization**: Tasks grouped by user story. All changes are in `src/cli/init.js` and `test/unit/init.test.js`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (no file conflicts)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Foundational (maskToken helper — blocks US1 and US2)

**Purpose**: Extract `maskToken` as an exported pure helper before modifying the interactive wizard. Tests are written first (Red → Green).

**⚠️ CRITICAL**: US2 (token masking) and US1 (pre-fill) both depend on `maskToken` existing.

- [x] T001 Write failing unit tests for `maskToken` helper (all token formats: long, short ≤8 chars, exactly 9 chars, non-ghp prefix) in `test/unit/init.test.js`
- [x] T002 Add and export `maskToken(token)` pure helper to `src/cli/init.js` — format: `token.slice(0,4) + '***...' + token.slice(-4)` for tokens >8 chars, `'***'` otherwise — make T001 tests pass

**Checkpoint**: `npm test test/unit/init.test.js` — new maskToken tests pass, all existing tests still pass

---

## Phase 2: User Story 1 — Pre-fill Scalar Prompts on Re-run (Priority: P1) 🎯 MVP

**Goal**: On re-run, load existing config and pre-fill all non-sensitive prompts. Remove the "Update it?" gate.

**Independent Test**: Run `cockpit init` with a valid existing config, press Enter at every prompt, verify `~/.cockpit/config.json` is unchanged.

### Implementation for User Story 1

- [x] T003 [US1] Hoist `existing` variable out of the `if (fs.existsSync)` block and remove the `createRequire` import and the "Existing config found. Update it?" `confirm()` gate from `collectConfigInteractive` in `src/cli/init.js`
- [x] T004 [US1] Add `logger.warn` on malformed config parse failure (set `existing = null` and warn "Config file could not be read — starting fresh setup") in `src/cli/init.js`
- [x] T005 [P] [US1] Add `initialValue: existing?.githubOwner ?? ''` to the `githubOwner` text prompt in `collectConfigInteractive` in `src/cli/init.js`
- [x] T006 [P] [US1] Add a `pollIntervalSeconds` text prompt with `initialValue: String(existing?.pollIntervalSeconds ?? 30)` and numeric validation (`/^\d+$/.test(v)`) in `collectConfigInteractive` in `src/cli/init.js`
- [x] T007 [P] [US1] Add a `postImplementCommand` text prompt with `initialValue: existing?.postImplementCommand ?? ''` (no validation — optional field) in `collectConfigInteractive` in `src/cli/init.js`
- [x] T008 [US1] Update the returned config object in `collectConfigInteractive` to use the prompted `pollIntervalSeconds` and `postImplementCommand` values (instead of hardcoded `30` and `''`) in `src/cli/init.js`

**Checkpoint**: Run `cockpit init` with existing config — all scalar fields pre-filled, press Enter to keep, wizard completes without the old confirm gate. `npm test` passes.

---

## Phase 3: User Story 2 — Token Masking (Priority: P2)

**Goal**: GitHub token prompt shows a masked hint when a token already exists. Empty submission keeps the existing token.

**Independent Test**: Inspect prompt message text when a token is stored — must contain `***...` substring, not the full token. Press Enter → token unchanged in config.

### Implementation for User Story 2

- [x] T009 [US2] Modify the `githubToken` password prompt in `collectConfigInteractive`: when `existing?.githubToken` is set, embed `maskToken(existing.githubToken)` in the prompt message (e.g., `[current: <hint>, Enter to keep]`) and after `password()` resolves, treat empty/cancelled response as "keep existing" in `src/cli/init.js`

**Checkpoint**: Run `cockpit init` with a stored token — prompt shows masked hint, pressing Enter leaves token unchanged, typing a new value replaces it. `npm test` passes.

---

## Phase 4: User Story 3 — Repo Summary Display (Priority: P3)

**Goal**: When repos already exist, print a summary list before offering to add more. Existing repos are preserved without any per-repo interaction.

**Independent Test**: Run `cockpit init` with two repos configured, press Enter past all scalar prompts, answer "No" to "Add another repo?" — resulting config has the same two repos.

### Implementation for User Story 3

- [x] T010 [US3] When `existing?.repos?.length > 0`, print a formatted repo summary (`\nWatched repos:` header + `  • <repo>  →  <localPath>` per entry) via `logger.log` before starting the addMore loop in `collectConfigInteractive` in `src/cli/init.js`
- [x] T011 [US3] Pre-populate the `repos` array with `[...existing.repos]` before the addMore loop so existing repos are preserved; set addMore loop's "Add another repo?" confirm `initialValue` to `false` when existing repos are present in `src/cli/init.js`

**Checkpoint**: Run `cockpit init` with existing repos — summary list is printed, existing repos are in final config, new repos can be appended. `npm test` passes.

---

## Phase 5: Polish & Verification

**Purpose**: Final validation, lint pass, and regression check.

- [x] T012 [P] Run `npm test` — confirm all existing tests pass plus new `maskToken` tests in `test/unit/init.test.js`
- [x] T013 [P] Run `npm run lint` — fix any ESLint issues introduced in `src/cli/init.js` (verified via `node --check`)
- [ ] T014 Manual acceptance test: run `cockpit init` against a live existing config and verify all three user story acceptance scenarios from `specs/010-init-preserve-config/spec.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start here
- **US1 (Phase 2)**: Depends on Phase 1 (uses `existing` variable; `maskToken` not required but T003–T008 are independent of it)
- **US2 (Phase 3)**: Depends on Phase 1 (`maskToken` must exist) and T003 (existing config loading)
- **US3 (Phase 4)**: Depends on T003 (existing config loading and `existing.repos`)
- **Polish (Phase 5)**: Depends on all implementation phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational phase — no other story dependencies
- **US2 (P2)**: Depends on Foundational phase + T003 from US1
- **US3 (P3)**: Depends on T003 from US1

### Within Each User Story

- T003 (gate removal + `existing` hoisting) MUST complete before T004–T011 (all depend on `existing` being in scope)
- T005–T008 within US1 are independent of each other (different prompts/fields)
- T010 and T011 within US3 must run in order (T011 depends on T010's setup)

---

## Parallel Opportunities

```text
# Phase 1: Run in sequence (T002 depends on T001 failing first)
T001 → T002

# Phase 2: T005, T006, T007 can run in parallel after T003
T003 → T004 (immediately after)
T003 → T005 [P]
T003 → T006 [P]
T003 → T007 [P]
T005 + T006 + T007 → T008

# Phase 3: Single task
T002 + T003 → T009

# Phase 4: T011 depends on T010
T003 → T010 → T011

# Phase 5: T012 and T013 are parallel
T012 [P]
T013 [P]
T014 (after T012 passes)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (maskToken)
2. Complete Phase 2: User Story 1 (pre-fill scalar prompts)
3. **STOP and VALIDATE**: Run `cockpit init` — verify pre-fill works, gate is gone
4. If validated, continue to US2 and US3

### Incremental Delivery

1. Foundational → maskToken unit tests pass
2. US1 → Pre-fill works, confirm gate removed (most impactful change)
3. US2 → Token masking works
4. US3 → Repo summary works
5. Each story adds value without breaking previous

---

## Notes

- All changes are in exactly 2 files: `src/cli/init.js` and `test/unit/init.test.js`
- `collectConfigInteractive` is not exported — interactive tests are manual (acceptance scenarios)
- `maskToken` IS exported — fully unit testable
- The `createRequire` unused import on line 271 of `src/cli/init.js` should be removed in T003
- No new npm dependencies introduced
- `--yes` mode (`buildConfigFromEnv`) is unchanged throughout
