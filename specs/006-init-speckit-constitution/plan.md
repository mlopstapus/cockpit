# Implementation Plan: Enhanced Cockpit Initialization

**Branch**: `006-init-speckit-constitution` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-init-speckit-constitution/spec.md`

## Summary

Extend `cockpit init` to (1) ask users whether they've already cloned a repo before prompting for a path — if not, clone it using the configured PAT — (2) offer to run `specify init <localPath> --ai claude` to install spec-kit into each registered repo, and (3) offer a four-prompt constitution wizard that writes `.specify/memory/constitution.md`. All new steps are individually skippable. The entire change is contained in `src/cli/init.js` and a new test file.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `@clack/prompts` (existing), `node:child_process` (spawnSync — existing), `node:fs`, `node:path`, `node:os`
**Storage**: `~/.cockpit/config.json` (existing schema, unchanged) + `<repo>/.specify/memory/constitution.md` (new file in target repo)
**Testing**: `node:test` + `node:assert/strict`
**Target Platform**: macOS + Linux host
**Project Type**: CLI tool
**Performance Goals**: Init completes under 5 minutes (IO-bound — git clone and specify init dominate)
**Constraints**: No new npm dependencies. `specify` CLI is a Python package (`specify-cli`), not bundled — must be on PATH.
**Scale/Scope**: Single-file change (`src/cli/init.js`) + one new test file

## Constitution Check

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All changes on feature branch; no hardcoded project-specific behaviour — specify path is configurable and all-repos is iterated from config | ✅ |
| II. Thorough Change Review | Delivered as PR; description, tests, and compliance notes included | ✅ |
| III. Security First | PAT embedded in clone URL only — never echoed to terminal, not written to disk; URL passed as shell argument (not logged by git progress output); validate all user text inputs before use in shell args | ✅ |
| IV. Test-Driven Implementation | New exported helpers (`parseRepoIdentifier`, `buildCloneUrl`, `cloneRepo`, `runSpecifyInit`, `buildConstitutionMarkdown`) are pure/injectable and tested before implementation. Integration path covered by existing `runInit` tests. | ✅ |
| V. Dev Box Execution Model | Host-OS execution; `specify init` and `git clone` run directly on host; no containers | ✅ |
| VI. Continuous Self-Improvement | `/ralph` at session close; backlog and memory updated | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/006-init-speckit-constitution/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── cli-schema.md    ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
└── cli/
    └── init.js          ← only file modified

test/
└── unit/
    ├── init.test.js     ← existing (unchanged)
    └── init-repo-setup.test.js  ← new: tests for new helpers
```

**Structure Decision**: Single-project, single-file change. Option 1. The entire feature is a set of new exported helper functions and modifications to the interactive wizard loop inside `src/cli/init.js`. No new modules, no new directories.

## Implementation Phases

### Phase 1: New pure helpers (test-first)

Write tests in `test/unit/init-repo-setup.test.js` first, then implement in `src/cli/init.js`.

**Functions to add:**

1. `parseRepoIdentifier(input)` → `string|null`
   - Accepts `owner/repo` or `https://github.com/owner/repo[.git]`
   - Returns normalized `owner/repo` or null

2. `buildCloneUrl(ownerRepo, token)` → `string`
   - Returns `https://<token>@github.com/<owner>/<repo>.git`
   - Pure, no side effects

3. `cloneRepo(cloneUrl, dest, { spawnFn = spawnSync } = {})` → `{ ok, error }`
   - Calls `spawnFn('git', ['clone', cloneUrl, dest], { stdio: 'inherit' })`
   - Returns `{ ok: true }` on exit 0, `{ ok: false, error: stderr/message }` otherwise

4. `runSpecifyInit(localPath, { which = defaultWhich, spawnFn = spawnSync } = {})` → `{ ok, error }`
   - Checks `specify` on PATH via `which`; returns `{ ok: false, error: 'not-found' }` if absent
   - Calls `spawnFn('specify', ['init', localPath, '--ai', 'claude'], { stdio: 'inherit' })`
   - Returns `{ ok: true }` on exit 0, `{ ok: false, error: 'non-zero' }` otherwise

5. `buildConstitutionMarkdown(answers)` → `string`
   - Pure function; takes `{ corePrinciples, securityRequirements, developmentWorkflow, governance }`
   - Returns formatted markdown string

### Phase 2: Update interactive wizard

Modify `collectConfigInteractive` in `src/cli/init.js`:

- In the repo-adding loop, before asking for `localPath`:
  - Ask `confirm({ message: 'Have you already cloned this repo locally?' })`
  - Branch YES: existing `text({ message: 'Local clone path...' })` prompt
  - Branch NO: `text({ message: 'GitHub repo (owner/name or HTTPS URL):' })` → parse → `text({ message: 'Clone to:', initialValue: defaultCloneDest })` → check non-empty dir → `cloneRepo(...)`
- After `repos.push(...)`:
  - Ask `confirm({ message: 'Install spec-kit into <localPath>?', initialValue: false })`
  - If YES: `runSpecifyInit(localPath)`; on failure: warn and continue
  - If spec-kit install succeeded (or user said yes and it was already there), ask `confirm({ message: 'Set up a project constitution?', initialValue: false })`
  - If YES: 4 `text` prompts with defaults → `buildConstitutionMarkdown` → `fs.writeFileSync`

### Phase 3: Update --yes mode

In `buildConfigFromEnv`, handle `SPECKIT_INIT=1`:
- After config is assembled, return a flag `specKitInit: true` if env var is set
- In `runInit`, after writing config and before printNextSteps, if `specKitInit`, call `runSpecifyInit` for each repo (log result, don't abort)

### Phase 4: Update printNextSteps

Remove the manual `specify init --here --ai claude` instruction from `printNextSteps` — it's now offered interactively. Replace with a conditional message if any repos were added without spec-kit.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PAT in clone URL | `https://<token>@github.com/...` | No credential helper mutation; in-process only; standard HTTPS git auth |
| `specify` invocation | `spawnSync` with `stdio: 'inherit'` | Stream output to user; specify owns its own UX; Cockpit only reads exit code |
| Existing-install check | Delegated to `specify init` | Per clarification Q5 — Cockpit does not pre-check `.specify/` |
| Constitution output path | `.specify/memory/constitution.md` | Matches cockpit's own constitution location |
| Non-interactive constitution | Not supported (`--yes` mode skips) | Requires 4 interactive prompts; CI use case doesn't need it |
