<!--
Sync Impact Report
==================
Version change: 1.2.0 → 1.2.1
Modified principles:
  - VI. Continuous Self-Improvement — clarified: /ralph MUST be run at session close
    as the canonical mechanism for the self-improvement ritual
Added sections: N/A
Removed sections: N/A
Templates requiring updates:
  ✅ .specify/templates/plan-template.md  — No changes needed
  ✅ .specify/templates/tasks-template.md — No changes needed
  ✅ .specify/templates/spec-template.md  — No changes needed
  ✅ .specify/templates/agent-file-template.md — No changes needed
Follow-up TODOs: None
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
- Cockpit MUST be designed to serve multiple project types and use cases beyond
  any single original use case. Features MUST NOT be built for one specific
  project; all project-specific behaviour MUST be expressed through
  configuration, not source code.

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

- Input from external sources (GitHub issue bodies, API payloads) MUST be
  validated and sanitised server-side before any processing or agent invocation.
- Network access to the control plane MUST be restricted to a private network.
  Any VPN or private overlay network is acceptable; Tailscale is the documented
  and supported reference implementation. The control plane MUST NOT be exposed
  to the public internet.
- Secrets and configuration MAY be stored in GitHub (GitHub Secrets, GitHub
  Environments, or repository variables) as the authoritative source. Secrets
  MUST be injected into the runtime environment via environment variables and
  MUST NOT appear in source code, logs, or PR diffs.
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

### V. Dev Box Execution Model

Cockpit is designed to run on a developer's machine (bare metal or VM), not as
a containerised service. This is the non-negotiable execution model.

- The agent process MUST run directly on the host OS with access to real file
  paths, TTYs, and locally installed tools. Containerised agent execution is
  not supported.
- Cockpit's primary purpose is to trigger and observe applications running on
  the dev box's localhost and to make those applications reachable to the
  developer's own devices (e.g., phones, tablets) over a private network
  connection.
- Post-implement hooks (e.g., restarting a dev server) MUST be expressed as
  configurable shell commands, not as code paths hard-wired to a specific
  application or framework.
- Infrastructure services (e.g., Redis) MAY run in containers for isolation,
  but the agent and its spawned processes MUST run on the host.

### VI. Continuous Self-Improvement

Each session MUST leave the system better than it found it. Agent sessions and
human collaborators MUST capture learnings, surface tech debt, and sharpen
tooling at session close — not defer improvement to a hypothetical later time.

- At the end of every session, memory MUST be updated with any new user
  preferences, feedback, project context, or non-obvious discoveries that
  would improve future sessions.
- Prompt and workflow templates (`.specify/templates/`, `.specify/memory/`)
  MUST be revised when a session reveals ambiguity, missing guidance, or a
  better default approach.
- Any future work items — new features, tech debt, or quality improvements —
  identified during a session MUST be logged to the `backlog/` directory before
  the session closes.
- Backlog entries MUST include: a short title, the motivation (why it matters),
  and a rough priority (P1 critical / P2 important / P3 nice-to-have).
- Improvements to templates or memory MUST NOT be deferred; they MUST be
  committed in the same session they are identified.
- The `/ralph` skill MUST be invoked at the close of every session as the
  canonical mechanism for executing the self-improvement ritual: reviewing the
  session, updating memory, improving prompts, and logging backlog items.

## Security Requirements

The Cockpit control plane executes commands on the host machine. This elevated
privilege surface requires these explicit controls to be verified on every feature:

- **Authentication**: All endpoints MUST be gated at the network level via a
  VPN or private overlay network. Tailscale ACLs are the documented reference
  implementation. No unauthenticated endpoint may be exposed to the public
  internet.
- **Input Validation**: Feature descriptions and any content from GitHub (issue
  bodies, comments) MUST be sanitised server-side before being passed to any
  agent process.
- **Process Isolation**: Each Claude Code agent session MUST run in a dedicated
  PTY with no shared state between sessions.
- **Secrets Management**: Secrets MUST be injected via environment variables at
  runtime (sourced from GitHub Secrets/Environments or a local `.env` file) and
  MUST NOT appear in logs or WebSocket streams.
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
- All project-specific behaviour (post-implement hooks, service names, network
  addresses) MUST be expressed through configuration or environment variables,
  never hardcoded in source files.
- At session close, `/ralph` MUST be run to drive memory updates, template
  improvements, and backlog entries. The `/finish` skill invokes `/ralph`
  automatically; when closing a session without `/finish`, `/ralph` MUST be
  called explicitly.

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
All PRs MUST include a Constitution Check confirming compliance with all six
principles. Complexity that violates a principle MUST be justified in the plan's
Complexity Tracking table. Runtime development guidance lives in
`.specify/templates/agent-file-template.md`.

**Version**: 1.2.1 | **Ratified**: 2026-03-17 | **Last Amended**: 2026-03-23
