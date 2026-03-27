# Implementation Plan: Init Preserve Config

**Branch**: `010-init-preserve-config` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-init-preserve-config/spec.md`

## Summary

Update the `cockpit init` interactive wizard to pre-fill prompts with existing config values on re-run. When a config already exists, each prompt shows the stored value as a default (press Enter to keep, type to replace). The GitHub token shows a masked hint instead of the full value. Existing repos are shown as a summary list before offering to add more. The current yes/no "Update it?" gate is removed — the wizard goes straight into pre-filled prompts. No schema changes. No new dependencies.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `@clack/prompts` (existing), `commander@12` (existing), `chalk` (existing)
**Storage**: `~/.cockpit/config.json` (JSON file, read at wizard start; schema unchanged)
**Testing**: `node:test` (built-in, existing test suite in `test/unit/init.test.js`)
**Target Platform**: macOS / Linux developer host machine
**Project Type**: CLI tool
**Performance Goals**: N/A (interactive wizard)
**Constraints**: No new npm dependencies; all changes scoped to `src/cli/init.js` and `test/unit/init.test.js`
**Scale/Scope**: Single-user CLI; config is one JSON file

## Constitution Check

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All changes on feature branch `010-init-preserve-config`. No project-specific behavior hardcoded — masking/pre-fill logic is generic for any config shape. | ✅ |
| II. Thorough Change Review | Delivered as a PR with test results and description. | ✅ |
| III. Security First | Token never displayed in plaintext. `maskToken` helper enforces this. No new external inputs introduced. | ✅ |
| IV. Test-Driven Implementation | Unit tests for `maskToken` and pre-fill behavior written alongside implementation. | ✅ |
| V. Dev Box Execution Model | CLI wizard — runs on host OS. No containers, no new services. | ✅ |
| VI. Always Self-Reflect | Assumptions verified against spec and existing code before implementation. No contradictory statements remain. | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/010-init-preserve-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (changes only)

```text
src/
└── cli/
    └── init.js          # Primary change: collectConfigInteractive + maskToken export

test/
└── unit/
    └── init.test.js     # Add tests for maskToken and pre-fill behavior
```

No new files in `src/`. No changes to config schema, DB, or any other module.

## Implementation Design

### New exported helper: `maskToken(token)`

```text
maskToken('ghp_abcdefghijklmnop') → 'ghp_***...mnop'
maskToken('abc')                  → '***'
```

Rules:
- If `token.length <= 8`: return `'***'`
- Else: `token.slice(0, 4) + '***...' + token.slice(-4)`

Exported from `init.js` so it can be unit tested directly without mocking `@clack/prompts`.

---

### Modified: `collectConfigInteractive({ configDir, logger })`

**Step 1 — Load existing config (replace current confirm gate)**

Current behavior (lines 269–287):
```
if config exists → confirm "Update it?" → cancel if no
```

New behavior:
```
if config exists → try JSON.parse → set `existing` (or null on failure + warn)
// No confirm prompt — go straight to pre-filled wizard
```

**Step 2 — Token prompt**

Current:
```js
const token = await password({ message: 'GitHub personal access token (repo scope):' });
```

New (when `existing?.githubToken`):
```js
const hint = maskToken(existing.githubToken);
const raw = await password({
  message: `GitHub personal access token [current: ${hint}, Enter to keep]:`,
});
const token = raw.trim() === '' ? existing.githubToken : raw;
```

When no existing token (first run): unchanged behavior.

**Step 3 — Owner prompt**

Current:
```js
const owner = await text({ message: '...', validate: ... });
```

New:
```js
const owner = await text({
  message: '...',
  initialValue: existing?.githubOwner ?? '',
  validate: v => v.trim() ? undefined : 'Required',
});
```

**Step 4 — Repos section**

Current: `addMore = true` loop from empty list.

New when `existing?.repos?.length > 0`:
```
logger.log('\nWatched repos:');
for (repo of existing.repos: logger.log(`  • ${repo.repo}  →  ${repo.localPath}`)
repos = [...existing.repos]   // start with preserved list
// then run addMore loop as today (initialValue: false for "Add another repo?")
```

When no existing repos: unchanged behavior.

**Step 5 — Config assembly**

Current hardcodes `pollIntervalSeconds: 30` and `postImplementCommand: ''`.

New: prompts for both fields with `initialValue` from existing config:
```js
const pollInterval = await text({
  message: 'Poll interval in seconds:',
  initialValue: String(existing?.pollIntervalSeconds ?? 30),
  validate: v => /^\d+$/.test(v.trim()) ? undefined : 'Must be a number',
});
const postCmd = await text({
  message: 'Post-implement shell command (optional):',
  initialValue: existing?.postImplementCommand ?? '',
});
```

**Step 6 — Cancel safety (FR-007)**

No change needed: `@clack/prompts` `isCancel()` + early `return null` pattern is already used throughout. Config is only written at the end of `runInit` after the wizard completes — cancellation at any prompt returns `null` without writing.

---

### Unchanged behaviors

- `buildConfigFromEnv` (--yes mode): No changes. Strict env var requirement preserved (FR-008).
- `validateConfig`: No changes.
- `writeConfig`: No changes.
- `writeServiceFile` / `enableService`: No changes (idempotent re-write is fine).
- `writeConstitution`: No changes.
- `checkPrereqs`: No changes.

## Test Plan

All tests added to `test/unit/init.test.js`.

### New test group: `maskToken`

| Test | Assertion |
|------|-----------|
| Long token → prefix + `***...` + suffix | `maskToken('ghp_abcdefghijklmnop')` === `'ghp_***...mnop'` |
| Short token (≤8 chars) → `'***'` | `maskToken('abc')` === `'***'` |
| Exactly 9 chars → shows 4+4 | `maskToken('123456789')` === `'1234***...6789'` |
| Token with non-ghp prefix | `maskToken('github_pat_abc123xyz')` → shows first 4 + last 4 |

### New test group: `buildConfigFromEnv` (regression — no behavior change)

Existing tests already cover this; no new tests needed.

### New test group: `collectConfigInteractive` behavior

`collectConfigInteractive` is not currently exported and calls `@clack/prompts` which is an async dynamic import. Testing the interactive function requires mocking the module — this is out of scope for unit tests. The pre-fill and masking logic will be covered by:
1. `maskToken` unit tests (the core security behavior)
2. Manual acceptance testing against the scenarios in spec.md

If the project later adds a test harness for mocking `@clack/prompts`, the `collectConfigInteractive` tests should be added then.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `@clack/prompts` `password()` treats empty string as cancel | Use `isCancel()` check before testing `raw.trim() === ''`. If cancelled, return null as usual. |
| Malformed existing config causes crash mid-wizard | try/catch wraps the JSON.parse; `existing = null` on failure; fresh-setup path is same as today |
| Service re-enable on re-run causes launchd error | `writeServiceFile` and `enableService` are idempotent (overwrite is fine); launchd may warn on re-load but won't fail the init |
