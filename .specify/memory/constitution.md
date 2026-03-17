<!--
Sync Impact Report
==================
Version change: N/A (initial) → 1.0.0
Modified principles: N/A — initial ratification from template
Added sections:
  - Core Principles (I–IV)
  - Security Requirements
  - Development Workflow
  - Governance
Removed sections: N/A
Templates requiring updates:
  ✅ .specify/templates/plan-template.md  — Constitution Check gates populated
  ✅ .specify/templates/tasks-template.md — Test tasks changed from OPTIONAL to MANDATORY
  ✅ .specify/templates/spec-template.md  — Reviewed; aligns with principles (no changes needed)
  ✅ .specify/templates/agent-file-template.md — Reviewed; generic template, no principle refs
Follow-up TODOs: None — all placeholders resolved
-->

# Cockpit Constitution

## Core Principles

### I. Trust-Based Collaboration

Cockpit grants Claude Code agents broad host-machine access because that trust
has been explicitly given by the project owner. This trust MUST be honoured:
every automated action must be transparent, auditable, and strictly within the
scope of the requested feature.

- Agents MUST operate only on explicitly scoped feature branches.
- No action affecting shared infrastructure, the `main` branch, or external
  services may be taken without explicit human approval.
- Session logs MUST be retained and accessible so that any agent action can be
  audited after the fact.

### II. Thorough Change Review

All changes MUST pass human review before merging. Autonomous execution is a
productivity tool, not a bypass for human judgment.

- Every feature MUST be delivered as a pull request; direct pushes to `main`
  are prohibited.
- PRs MUST include a clear description of changes, test results, and any
  compliance notes.
- The human reviewer MUST examine session logs before approving a PR created
  by an autonomous agent session.
- Auto-merge is prohibited. Force-push to `main` is prohibited.

### III. Security First

Work MUST be produced with security as a first-class concern, not an afterthought.
The Cockpit control plane executes commands on the host machine; this elevated
privilege demands explicit controls.

- Input from external sources (mobile UI, API payloads) MUST be validated and
  sanitised server-side before any processing or agent invocation.
- Network access to the backend MUST route through Tailscale; the control plane
  MUST NOT be exposed to the public internet.
- Secrets (API keys, tokens, credentials) MUST NOT appear in source code, logs,
  or PR diffs.
- Dependencies MUST be pinned and reviewed for known vulnerabilities before
  merging.
- PTY sessions MUST be isolated per feature; no shared session state between
  concurrent or sequential features.

### IV. Test-Driven Implementation

Tests are not optional. Every feature MUST include tests created and implemented
as part of the feature work — not deferred to a later phase.

- Tests MUST be written before or alongside implementation (Red-Green-Refactor).
- All tests MUST pass before the agent creates a PR.
- Backend features MUST include pytest coverage for all critical paths.
- Frontend features MUST include component or integration tests.
- Security-sensitive paths (PTY spawning, WebSocket handling, input validation)
  MUST have explicit test coverage.

## Security Requirements

The Cockpit control plane executes commands on the host machine. This elevated
privilege surface requires these explicit controls to be verified on every feature:

- **Authentication**: All endpoints MUST be gated at the network level via
  Tailscale ACLs. No unauthenticated endpoint may be exposed.
- **Input Validation**: Feature descriptions from the mobile UI MUST be
  sanitised server-side before being passed to any agent process.
- **Process Isolation**: Each Claude Code agent session MUST run in a dedicated
  PTY with no shared state between sessions.
- **Secrets Management**: Secrets MUST be injected via environment variables at
  runtime and MUST NOT appear in logs or WebSocket streams.
- **Audit Trail**: All PTY session output MUST be persisted for post-hoc review
  before a PR is approved.

## Development Workflow

- Feature branches MUST follow the naming convention: `###-feature-name`.
- The canonical execution path is the `/new` → `/plan` → `/implement` → `/finish`
  skill workflow; deviations from this path MUST be documented.
- Linting and type-checking (ruff/pylint for Python; eslint/tsc for TypeScript)
  MUST pass before any commit is made.
- Database migrations MUST be reviewed for reversibility before merging.
- Agent sessions MUST be stoppable from the mobile UI at any point during
  execution.

## Governance

This Constitution supersedes all other development practices for the Cockpit
project. Amendments require:

1. A written rationale explaining the need for change.
2. An appropriate version bump (see Versioning Policy below).
3. Updates to all dependent templates listed in the Sync Impact Report.
4. Review and approval by the project owner before the amendment takes effect.

**Versioning Policy**
- MAJOR: Removal or redefinition of a core principle; backward-incompatible
  governance change.
- MINOR: New principle or section added; materially expanded guidance.
- PATCH: Clarifications, wording fixes, non-semantic refinements.

**Compliance Review**
All PRs MUST include a Constitution Check confirming compliance with all four
principles. Complexity that violates a principle MUST be justified in the plan's
Complexity Tracking table. Runtime development guidance lives in
`.specify/templates/agent-file-template.md`.

**Version**: 1.0.0 | **Ratified**: 2026-03-17 | **Last Amended**: 2026-03-17
