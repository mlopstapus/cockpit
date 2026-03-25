# Implementation Plan: Public-Facing README and Documentation

**Branch**: `007-public-readme-docs` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-public-readme-docs/spec.md`

## Summary

Enhance the existing `README.md` into a complete public-facing document for an open-source release, and add `CONTRIBUTING.md`. The LICENSE (MIT) already exists. The README needs six new sections (Q&A, Troubleshooting, security callout, Architecture flow diagram, contributing pointer, license badge) and updates to the existing CLI reference (add `jobs`, add `-f` flag to `logs`). Tone is first-person honest; no marketing copy. No source code changes.

## Technical Context

**Language/Version**: Markdown (no build step)
**Primary Dependencies**: None — static files only
**Storage**: N/A
**Testing**: Manual review against FR-001–FR-014 and SC-001–SC-006; no automated tests (see Constitution Check note below)
**Target Platform**: GitHub README renderer (CommonMark + GFM)
**Project Type**: Documentation / open-source repo hygiene
**Performance Goals**: N/A
**Constraints**: README must render correctly on GitHub; no HTML tags; fenced code blocks only
**Scale/Scope**: Three files — README.md (replace), CONTRIBUTING.md (new), LICENSE (already exists — no change needed)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All changes on feature branch `007-public-readme-docs`; no shared infrastructure touched | ✅ |
| II. Thorough Change Review | Delivered as a PR with full diff visible | ✅ |
| III. Security First | No external inputs, no secrets, no executable code. FR-011 security callout block explicitly addresses `--dangerously-skip-permissions` trust disclosure. | ✅ |
| IV. Test-Driven Implementation | **Justified deviation**: this feature produces only static markdown files. No executable code paths exist. Acceptance is verified manually against the FR/SC checklist during implementation. | ⚠️ Justified |
| V. Dev Box Execution Model | N/A — no agent process, no hooks, no runtime behaviour | ✅ |
| VI. Always Self-Reflect | Agent will verify each section against spec acceptance criteria before marking tasks complete; `/ralph` invoked at session close | ✅ |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| IV — no automated tests | Static markdown only; no code paths to test | A "test" that lints markdown would add tooling complexity with near-zero regression value |

## Project Structure

### Documentation (this feature)

```text
specs/007-public-readme-docs/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A — no data entities; omitted
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── readme-structure.md   # Section contract for README.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Files (repository root)

```text
README.md                # Update: add Q&A, Troubleshooting, security callout,
                         #         Architecture diagram, jobs command, -f flag,
                         #         license badge, contributing pointer, tone pass
CONTRIBUTING.md          # New: contributor guide
LICENSE                  # Exists (MIT) — no changes needed
```

**Structure Decision**: Single-project documentation. No src/ changes. All deliverables are markdown files at repo root.
