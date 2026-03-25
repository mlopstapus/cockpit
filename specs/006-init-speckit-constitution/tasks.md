# Tasks: Enhanced Cockpit Initialization with Spec-Kit and Constitution Setup

**Input**: Design documents from `/specs/006-init-speckit-constitution/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/cli-schema.md ✅

**Tests**: Tests are included for all new pure/injectable helpers per the constitution (Principle IV: Test-Driven Implementation). Tests MUST pass before PR is created.

**Organization**: Tasks grouped by user story. All source changes are in `src/cli/init.js`. New test file: `test/unit/init-repo-setup.test.js`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files or no dependencies on prior incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: Verify constraints; no new npm packages needed, no new modules.

- [ ] T001 Confirm `node:child_process` (spawnSync), `node:fs`, `node:path`, `node:os` cover all needs — no new npm deps required (read src/cli/init.js imports)

---

## Phase 2: Foundational — New Pure/Injectable Helpers

**Purpose**: Export new testable helper functions from `src/cli/init.js`. These are blocking prerequisites for all user story phases.

**⚠️ CRITICAL**: Write tests first (T002–T005), verify they FAIL, then implement (T006–T010).

### Tests (write first, must fail before implementation)

- [ ] T002 [P] Create `test/unit/init-repo-setup.test.js` with tests for `parseRepoIdentifier`: valid `owner/repo`, valid HTTPS URL `https://github.com/owner/repo`, valid HTTPS URL with `.git` suffix, invalid input returns null, SSH URL returns null
- [ ] T003 [P] Add tests for `buildCloneUrl` in `test/unit/init-repo-setup.test.js`: returns `https://<token>@github.com/owner/repo.git`, token is embedded correctly, no extra slashes
- [ ] T004 [P] Add tests for `cloneRepo` in `test/unit/init-repo-setup.test.js`: injectable `spawnFn` called with correct args, returns `{ ok: true }` on exit 0, returns `{ ok: false, error }` on non-zero exit; **security**: error message does NOT contain the raw clone URL (no PAT leak) — pass a URL with token and assert token is absent from the returned error string
- [ ] T005 [P] Add tests for `runSpecifyInit` in `test/unit/init-repo-setup.test.js`: returns `{ ok: false, error: 'not-found' }` when `which` throws, calls `spawnFn('specify', ['init', localPath, '--ai', 'claude'], ...)` on success, returns `{ ok: false, error: 'non-zero' }` on non-zero exit
- [ ] T006 [P] Add tests for `buildConstitutionMarkdown` in `test/unit/init-repo-setup.test.js`: output is a string, contains all four section headings (`## Core Principles`, `## Security Requirements`, `## Development Workflow`, `## Governance`), each answer appears in the output

### Implementation (after tests are written and failing)

- [ ] T007 Add `parseRepoIdentifier(input)` to exports in `src/cli/init.js`: accepts `owner/repo` shorthand or `https://github.com/owner/repo[.git][/...]`, returns normalized `owner/repo` string or `null` if invalid
- [ ] T008 Add `buildCloneUrl(ownerRepo, token)` to exports in `src/cli/init.js`: returns `https://<token>@github.com/<owner>/<repo>.git` — pure, no side effects
- [ ] T009 Add `cloneRepo(cloneUrl, dest, { spawnFn } = {})` to exports in `src/cli/init.js`: calls `spawnFn('git', ['clone', cloneUrl, dest], { stdio: 'inherit' })`, defaults `spawnFn` to `spawnSync` from `node:child_process`, returns `{ ok: true }` on status 0 or `{ ok: false, error: 'clone-failed' }` otherwise — **security**: the error value MUST be a fixed string, never the raw cloneUrl or any string derived from it (prevents PAT leak in logged error messages)
- [ ] T010 Add `runSpecifyInit(localPath, { which, spawnFn } = {})` to exports in `src/cli/init.js`: checks `specify` on PATH via `which` (default `defaultWhich`), returns `{ ok: false, error: 'not-found' }` if absent; otherwise calls `spawnFn('specify', ['init', localPath, '--ai', 'claude'], { stdio: 'inherit' })`, returns `{ ok: true }` on status 0 or `{ ok: false, error: 'non-zero' }` otherwise
- [ ] T011 Add `buildConstitutionMarkdown(answers)` to exports in `src/cli/init.js`: pure function taking `{ corePrinciples, securityRequirements, developmentWorkflow, governance }`, returns a formatted markdown string with `## Core Principles`, `## Security Requirements`, `## Development Workflow`, `## Governance` sections populated with user answers
- [ ] T012 Run `npm test` — confirm T002–T006 tests now pass with T007–T011 implemented

**Checkpoint**: All five new helpers exported, tested, and passing. User story implementation can now begin.

---

## Phase 3: User Stories 4 & 1 — "Already Cloned?" Prompt + Clone Flow (Priority: P1) 🎯 MVP

**User Story 4**: Backward compat — user says "Yes, already cloned" → provides local path as before.
**User Story 1**: New clone flow — user says "No" → provides GitHub identifier → Cockpit clones.

**Goal**: The repo-adding loop in `collectConfigInteractive` branches on "already cloned?" and handles both paths.

**Independent Test**: Run `cockpit init`, answer "Yes" → verify existing local path flow is unchanged. Answer "No" → provide `owner/repo` → verify git clone is invoked and repo registered with correct `localPath`.

### Implementation

- [ ] T013 [US4] [US1] In `collectConfigInteractive` in `src/cli/init.js`, add a `confirm` prompt **before** the local path prompt: `"Have you already cloned this repo locally?"` (default: `true`) — capture result as `alreadyCloned`; wrap with `isCancel` check (return null on cancel)
- [ ] T014 [US4] Wrap the existing local path `text` prompt in an `if (alreadyCloned)` branch in `src/cli/init.js` — no change to prompt text or validation; existing behavior fully preserved
- [ ] T015 [US1] Add `else` branch in `src/cli/init.js`: prompt `"GitHub repo (owner/name or HTTPS URL):"` with validation `v => parseRepoIdentifier(v.trim()) ? undefined : 'Enter owner/name or https://github.com/owner/repo'`; store parsed result as `ownerRepo`; wrap with `isCancel` check
- [ ] T016 [US1] After GitHub identifier prompt, derive `repoShortName` (last segment of `ownerRepo`, e.g. `"myrepo"`) for display only; present clone destination prompt: `"Clone to:"` with `initialValue: path.join(os.homedir(), 'repos', repoShortName)`; capture as `dest`; wrap with `isCancel` check in `src/cli/init.js`
- [ ] T017 [US1] Before cloning, check if destination directory exists and is non-empty (`fs.existsSync(dest) && fs.readdirSync(dest).length > 0`); if so, show a `confirm` prompt `"${dest} is not empty. Clone anyway?"` (wrap with `isCancel`); if user declines, `continue` to restart the repo-adding loop from T013 in `src/cli/init.js`
- [ ] T018 [US1] Call `cloneRepo(buildCloneUrl(ownerRepo, token), dest)` and check result; on `ok: false`, log `"Clone failed. Check the repo address and your PAT permissions."` then show a `confirm` prompt `"Try a different address?"` (wrap with `isCancel`); if yes, `continue` to restart the repo-adding loop from T013; if no, skip registration and break in `src/cli/init.js` (satisfies FR-004 retry)
- [ ] T019 [US1] On successful clone, set `localPath = dest`; log `"Cloned to ${localPath}"`; continue to `repos.push({ repo: ownerRepo, localPath })` — `ownerRepo` is the full `owner/name` string, matching the config schema in `src/cli/init.js`
- [ ] T020 Run `npm test` — confirm existing `test/unit/init.test.js` still passes (no regressions)

**Checkpoint**: Both "already cloned" paths work. Existing local-path flow unchanged. New clone flow registers the repo after cloning.

---

## Phase 4: User Story 2 — Spec-Kit Install Offer (Priority: P2)

**Goal**: After each repo is registered, offer to run `specify init <localPath> --ai claude`. Stream output; continue on failure.

**Independent Test**: Run `cockpit init`, register a repo, answer "Yes" to spec-kit install, verify `specify init` is called with the correct path and that declining does not abort init.

### Implementation

- [ ] T021 [US2] Immediately after `repos.push(...)` in `collectConfigInteractive` in `src/cli/init.js`, add a `confirm` prompt: `"Install spec-kit into ${localPath}?"` with `initialValue: false`; wrap with `isCancel` check
- [ ] T022 [US2] If user accepts: call `runSpecifyInit(localPath)` in `src/cli/init.js`; handle results:
  - `{ ok: false, error: 'not-found' }` → log `"specify not found — install it with: pip install specify-cli or uv tool install specify-cli"`; show a `note` prompt acknowledging the failure; set `specKitInstalled = false`
  - `{ ok: false, error: 'non-zero' }` → log `"specify init exited with an error. See output above."`; show a `confirm` prompt `"Continue without spec-kit?"` (wrap with `isCancel`; if cancelled treat as yes); set `specKitInstalled = false`
  - `{ ok: true }` → set `specKitInstalled = true`
- [ ] T023 [US2] If user declines spec-kit install, set `specKitInstalled = false` and continue — the loop must proceed to "Add another repo?" without error in `src/cli/init.js`

**Checkpoint**: Spec-kit install step is offered per repo, individually skippable, failures are non-fatal.

---

## Phase 5: User Story 3 — Constitution Wizard (Priority: P3)

**Goal**: After a successful spec-kit install (or if the user opted in knowing it's already there), offer a four-prompt constitution wizard that writes `.specify/memory/constitution.md`.

**Independent Test**: Run `cockpit init`, install spec-kit, proceed through constitution wizard, verify `<localPath>/.specify/memory/constitution.md` exists and contains the four section headings with user answers.

### Implementation

- [ ] T024 [US3] After `runSpecifyInit` succeeds (`specKitInstalled === true`), add a `confirm` prompt in `src/cli/init.js`: `"Set up a project constitution for ${localPath}?"` with `initialValue: false`
- [ ] T025 [US3] If constitution already exists at `<localPath>/.specify/memory/constitution.md`, present a `select` prompt with three options — `skip` / `view` / `overwrite` — in `src/cli/init.js` (wrap with `isCancel`); if `view`, log the existing file contents via `fs.readFileSync`, then re-show the `select` prompt; if `skip`, skip the wizard; if `overwrite`, proceed to T026
- [ ] T026 [US3] If user accepts (and overwrite confirmed if needed), present four `text` prompts in `src/cli/init.js`:
  - `"Core principles for this project:"` initialValue: `"All changes must be transparent, auditable, and scoped to feature branches."`
  - `"Security requirements:"` initialValue: `"Secrets must never appear in source code or logs. All external inputs must be validated."`
  - `"Development workflow (branching, review, testing):"` initialValue: `"Feature branches follow ###-feature-name convention. All features delivered as PRs. Tests required."`
  - `"Governance (how are decisions made?):"` initialValue: `"Changes to project principles require written rationale and project owner approval."`
- [ ] T027 [US3] Build markdown via `buildConstitutionMarkdown(answers)` and write to `<localPath>/.specify/memory/constitution.md` using `fs.writeFileSync` in `src/cli/init.js`; log `"Constitution written to ${constitutionPath}"`
- [ ] T028 [US3] If user skips constitution wizard, log `"Tip: run /speckit.constitution in ${localPath} to create a constitution later."` in `src/cli/init.js`

**Checkpoint**: Constitution wizard runs after successful spec-kit install, is skippable, and writes a valid markdown file.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Add `SPECKIT_INIT=1` env var support: in `buildConfigFromEnv` in `src/cli/init.js`, check `env.SPECKIT_INIT === '1'` and include `specKitInit: true` in the returned config object
- [ ] T030 [P] In `runInit` in `src/cli/init.js`, after writing config in `--yes` mode, if `config.specKitInit === true`, iterate `config.repos` and call `runSpecifyInit(repo.localPath)` for each — log result per repo, do not abort on failure
- [ ] T031 Update `printNextSteps` in `src/cli/init.js`: remove the manual `specify init --here --ai claude` instruction (now offered interactively); replace with `"  /speckit.constitution — set up project principles in a watched repo (if not done during init)"`
- [ ] T032 Add tests for `SPECKIT_INIT=1` env var parsing in `test/unit/init.test.js`: verify `buildConfigFromEnv` sets `specKitInit: true` when env var is `'1'`, and `specKitInit` is absent/falsy when env var is not set
- [ ] T033 Run `npm test` — verify all tests pass (existing + new)
- [ ] T034 Run through `quickstart.md` manual verification steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: No dependencies — can start immediately; write tests first, then implement
- **Phase 3 (US4 + US1)**: Requires Phase 2 complete (uses `parseRepoIdentifier`, `buildCloneUrl`, `cloneRepo`)
- **Phase 4 (US2)**: Requires Phase 2 complete (uses `runSpecifyInit`); can start after Phase 2 independently of Phase 3
- **Phase 5 (US3)**: Requires Phase 4 complete (constitution wizard is gated on spec-kit install); also uses `buildConstitutionMarkdown` from Phase 2
- **Phase 6 (Polish)**: Requires Phases 3–5 complete

### User Story Dependencies

- **US4 + US1 (Phase 3)**: Depend on Foundational helpers only
- **US2 (Phase 4)**: Depends on Foundational helpers only — can run in parallel with Phase 3
- **US3 (Phase 5)**: Depends on US2 (constitution gated on spec-kit install success)

### Parallel Opportunities

- T002–T006 (tests) can all be written in parallel (same file, different describe blocks — write sequentially in one pass)
- T007–T011 (helpers) can be written in parallel (all in same function — implement in one pass)
- T013–T019 (US4+US1 wizard) must be sequential (one function, ordered logic); T017 and T018 both `continue` the loop on decline/failure — no separate "retry task" needed
- T021–T023 (US2) can start after Phase 2 even while Phase 3 is in progress
- T029, T030, T032 (Phase 6 polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Write all tests in one pass (same file):
test/unit/init-repo-setup.test.js — T002 through T006

# Implement all helpers in one pass (same file):
src/cli/init.js — T007 through T011 (parseRepoIdentifier, buildCloneUrl, cloneRepo, runSpecifyInit, buildConstitutionMarkdown)
```

---

## Implementation Strategy

### MVP (User Stories 4 + 1 only — Phase 1–3)

1. Phase 1: Setup (quick)
2. Phase 2: Foundational helpers + tests
3. Phase 3: "Already cloned?" prompt + clone flow
4. **STOP and VALIDATE**: Test both branches of the init wizard
5. `npm test` — all tests pass

### Full Delivery (all stories)

1. Phases 1–3: MVP above
2. Phase 4: Spec-kit install offer
3. Phase 5: Constitution wizard
4. Phase 6: Polish + --yes mode + final test run

### Commit strategy

- Commit after Phase 2 (helpers + tests)
- Commit after Phase 3 (US4 + US1 wizard)
- Commit after Phase 4 (US2 spec-kit)
- Commit after Phase 5 (US3 constitution)
- Commit after Phase 6 (polish + all tests green)

---

## Notes

- All changes are in `src/cli/init.js` (one file) + `test/unit/init-repo-setup.test.js` (one new file)
- PAT is embedded in clone URL only — never echoed to terminal (`stdio: 'inherit'` shows git progress, not the URL argument); `cloneRepo` returns a fixed error string `'clone-failed'`, never the URL
- `specify init` owns its own "already installed" check — Cockpit only reads exit code (per clarification Q5)
- No new npm dependencies required
- `isCancel` guards are called out in each individual task description that introduces a new `@clack/prompts` call (T013, T015, T016, T017, T018, T021, T022, T024, T025)
