# Implementation Plan: Repo Startup Commands

**Branch**: `003-repo-startup-command` | **Date**: 2026-03-24 | **Spec**: `specs/003-repo-startup-command/spec.md`

## Summary

Add a per-repo optional `startupCommand` field to Cockpit's config that executes after each successful implement stage, reports the result as a GitHub issue comment, and is configurable via `cockpit repos add --startup-command`. This closes the gap between "code written" and "app testable" by making the startup step a first-class Cockpit concern.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: better-sqlite3, @octokit/rest, commander@12, node:child_process (execFile)
**Storage**: Config JSON (`~/.cockpit/config.json`) — no DB changes needed
**Testing**: node:test (built-in)
**Target Platform**: macOS / Linux dev box (launchd / systemd daemon)
**Project Type**: CLI tool + background daemon
**Performance Goals**: Startup command completes within 5-minute default timeout
**Constraints**: Backward compatible — repos without `startupCommand` unchanged; output capped at 50 lines
**Scale/Scope**: Per-repo config field; one startup command per repo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | Feature branch scoped; `startupCommand` is config, not hardcoded behaviour | ✅ |
| II. Thorough Change Review | Delivered as PR; session logs accessible via `cockpit logs` | ✅ |
| III. Security First | `startupCommand` is user-supplied shell; runs in repo `localPath` under daemon env; no injection vector beyond what `postImplementCommand` already exposes — same trust model | ✅ |
| IV. Test-Driven Implementation | Unit tests for `stage-executor`, `repos`, `config` will cover all critical paths | ✅ |
| V. Dev Box Execution Model | Command runs on host via `sh -c`; post-implement hook pattern already established | ✅ |
| VI. Continuous Self-Improvement | Memory updates, backlog entries, `/ralph` at session close | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/003-repo-startup-command/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-contract.md  # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── config/
│   └── index.js         # Add startupCommand default in readConfig
├── cli/
│   ├── repos.js         # Add --startup-command flag to repoAdd
│   └── index.js         # Wire --startup-command option
├── daemon/
│   └── stage-executor.js  # Add runStartupCommand() after implement stage

test/unit/
├── config.test.js       # startupCommand default + validation
├── repos.test.js        # --startup-command flag + update path
└── stage-executor.test.js  # startup command execution, timeout, reporting
```

**Structure Decision**: Single-project layout, extending existing modules. No new files required — all changes are additive modifications to existing source files.
