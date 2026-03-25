# Feature Specification: Public-Facing README and Documentation

**Feature Branch**: `007-public-readme-docs`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "documentation and quickstart: I want to turn this into a solid public facing open source repo with a README.md that gives a brief overview and quick start. It should have requirements. It should have Q and A. It should have quick troubleshooting steps also. Also overview the CLI commands."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Evaluator Reads README (Priority: P1)

A developer discovers Cockpit on GitHub and wants to quickly understand what it does, whether it fits their needs, and how to get started. They read the README from top to bottom and decide within a few minutes if this project is for them.

**Why this priority**: The README is the repo's front door. Without a compelling and clear README, potential users bounce before they ever try the tool.

**Independent Test**: Can be verified by reading the README cold and checking that overview, use case, requirements, install, and first run steps all make sense without prior knowledge.

**Acceptance Scenarios**:

1. **Given** a developer lands on the GitHub repo page, **When** they read the README, **Then** they understand what Cockpit does, who it is for, and what problem it solves within 60 seconds.
2. **Given** a developer reads the README, **When** they finish the Quick Start section, **Then** they know exactly what commands to run to get the daemon up and watching their first repo.
3. **Given** a developer is unsure if Cockpit fits their workflow, **When** they read the Q&A section, **Then** they find answers to common "is this right for me" questions.

---

### User Story 2 - Developer Follows Quick Start (Priority: P2)

A developer with Node.js and a GitHub PAT already set up follows the Quick Start guide from scratch, runs `cockpit init`, and has the daemon watching a repo within 10 minutes.

**Why this priority**: A working quick start builds trust and drives adoption. It is the second most important thing after understanding what the tool does.

**Independent Test**: Can be tested by following the Quick Start steps verbatim on a fresh machine and verifying the daemon starts and detects a test issue.

**Acceptance Scenarios**:

1. **Given** a developer has Node.js 18+ and a GitHub PAT, **When** they follow the Quick Start section step by step, **Then** the daemon starts without requiring them to read any other documentation.
2. **Given** a developer completes `cockpit init`, **When** they open a `[COCKPIT]`-prefixed issue, **Then** the issue is picked up and a comment is posted within `pollIntervalSeconds`.
3. **Given** a developer is on macOS or Linux, **When** they follow the Quick Start, **Then** the steps work identically on both platforms.

---

### User Story 3 - CLI Command Reference Lookup (Priority: P3)

A returning user needs to quickly recall a specific CLI command or flag without leaving GitHub. They find the CLI reference section in the README and get what they need in under 30 seconds.

**Why this priority**: Day-two usability — users return to docs for quick lookups, not just onboarding.

**Independent Test**: Can be tested by asking a user to locate a specific command (e.g., how to tail logs for a specific job) using only the README.

**Acceptance Scenarios**:

1. **Given** a user forgot the flag for following logs, **When** they look up `cockpit logs` in the CLI reference, **Then** they see the `-f` flag documented with a short description.
2. **Given** a user wants to add a new repo without re-running init, **When** they consult the CLI reference, **Then** they find `cockpit repos add` with the correct argument format.

---

### User Story 4 - Self-Resolving a Common Problem (Priority: P3)

A user whose daemon is not picking up issues looks up their symptom in the Troubleshooting section and finds a resolution path without needing to open an issue or ask for help.

**Why this priority**: Reduces support burden and improves user confidence. Most early failures are predictable and can be documented.

**Independent Test**: Can be tested by intentionally introducing a common error (e.g., wrong GitHub token scope) and verifying the troubleshooting section leads to the resolution.

**Acceptance Scenarios**:

1. **Given** a user's daemon appears to be running but issues are not picked up, **When** they read the Troubleshooting section, **Then** they find step-by-step diagnosis starting with `cockpit status`.
2. **Given** a user encounters a "permission denied" or auth error, **When** they check the Troubleshooting section, **Then** they find the correct GitHub PAT scope requirements.
3. **Given** a user on macOS sees launchd not restarting the daemon after a deploy, **When** they consult troubleshooting, **Then** they find the known `cockpit restart` workaround.

---

### Edge Cases

- What if a user's platform (Windows) is not supported? The README must clearly state macOS and Linux are supported; Windows is explicitly not supported.
- How should the Q&A address features that are intentionally out of scope (e.g., auto-merge, multiple parallel jobs)?
- What if the user does not have Claude Code CLI installed? Requirements section must list it as a prerequisite with a pointer to its installation.
- What if the user runs `cockpit init` non-interactively (CI/scripts)? The Quick Start or a note should mention the `--yes` flag and env var approach.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: README MUST include a brief (2–4 sentence) overview explaining what Cockpit does and the core "GitHub Issue → spec pipeline → PR" flow.
- **FR-002**: README MUST include a Requirements section listing all prerequisites: Node.js 18+, git, Claude Code CLI, a GitHub account, and a GitHub PAT with `repo` scope.
- **FR-003**: README MUST include a Quick Start section with numbered, copy-pasteable steps covering install, `cockpit init`, `cockpit start`, and opening a first `[COCKPIT]` issue.
- **FR-004**: README MUST include a CLI Command Reference section covering all top-level commands and their key flags: `init`, `start`, `stop`, `restart`, `status`, `logs` (with `-n` and `-f` flags), `repos list/add/remove`, `jobs` (with `-n` flag), `token`, and `daemon` (noted as internal — use `cockpit start` instead).
- **FR-005**: README MUST include a Q&A section addressing at least 6 common questions spanning: API cost/usage, platform support, crash recovery, adding more repos, how to answer clarification questions, and whether auto-merge occurs.
- **FR-006**: README MUST include a Troubleshooting section covering at least 4 common failure modes: daemon not running, issues not being picked up, rate limit behaviour, and auth/token errors.
- **FR-007**: README MUST be written for a technical audience (developers comfortable with CLI tools) but must not assume prior knowledge of Cockpit or spec-kit. Tone is first-person honest ("I built this for myself") — no "we" language, no community marketing copy.
- **FR-014**: README MUST include a single license badge (MIT) in the header area and a one-liner near the bottom pointing to `CONTRIBUTING.md` for contribution guidelines. No full badge row (no CI/npm/coverage badges).
- **FR-008**: README MUST include a brief Architecture section conveying the end-to-end flow (Issue → poll → queue → Claude → PR) without implementation jargon, using a text diagram if needed.
- **FR-011**: README MUST include a dedicated security/trust callout block (3–5 bullets) within or adjacent to the Architecture or Quick Start section, covering: what host access Claude receives via `--dangerously-skip-permissions`, that Claude runs inside the local repo clone only, and that no data leaves the machine except via the GitHub API for issue comments and PR creation.
- **FR-009**: All code blocks in the README MUST be fenced with the correct language identifier for syntax highlighting.
- **FR-010**: README MUST include a Configuration reference covering all fields in `~/.cockpit/config.json` so users can adjust polling interval, add a `postImplementCommand`, etc.
- **FR-012**: A `LICENSE` file MUST be created at repo root (MIT license) so the project is legally usable as open source.
- **FR-013**: A `CONTRIBUTING.md` file MUST be created at repo root documenting: how to open bug reports and feature requests, the PR workflow, and how to run tests locally (`npm test`).

### Key Entities

- **README.md**: The primary public-facing documentation file at repo root; replaces any existing placeholder README.
- **LICENSE**: License file to be added at repo root (MIT recommended for a CLI tool), making the project legally usable as open source.
- **CONTRIBUTING.md**: Contributor guide at repo root covering how to open issues, submit PRs, and run tests locally.
- **Sections** (README): Discrete named blocks — Overview, Requirements, Quick Start, Architecture, CLI Reference, Configuration, Q&A, Troubleshooting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior Cockpit knowledge can understand the tool's purpose within 60 seconds of reading the README.
- **SC-002**: A developer with all prerequisites installed can follow the Quick Start and have the daemon running in under 10 minutes.
- **SC-003**: All required README sections defined in the section contract (`contracts/readme-structure.md`) are present and non-empty.
- **SC-004**: A user encountering any of the 4 documented failure modes can self-resolve without opening a GitHub issue.
- **SC-005**: Every CLI command listed in `cockpit --help` is covered in the CLI Reference section.
- **SC-006**: The Q&A section answers at least 6 common questions without directing the reader elsewhere for the answer.

## Clarifications

### Session 2026-03-25

- Q: What level of security/trust disclosure should the README include for `--dangerously-skip-permissions`? → A: Dedicated callout block — a short "Security & Trust" note (3–5 bullets) covering: what access Claude gets, that it runs locally, no data leaves the machine except via GitHub API.
- Q: Should this feature include any companion OSS files beyond README.md? → A: README + LICENSE + CONTRIBUTING.md — add a license file and a contributing guide.
- Q: How should the README position Cockpit? → A: Personal tool, open to contributions — honest about scope, includes a license badge and a one-liner pointing to CONTRIBUTING.md; no "we" language, no full badge row.

## Assumptions

- The existing `CLAUDE.md` content (architecture, config reference, CLI commands) is authoritative and will be the source of truth for README content — no new features are invented for the README.
- The README targets macOS and Linux users; Windows is out of scope and should be noted as unsupported.
- The README will live at the repo root as `README.md`, replacing any placeholder README that currently exists.
- A simple ASCII flow diagram is acceptable for the Architecture section; no rendered image is required.
- The `postImplementCommand` and `startupCommand` config fields should be mentioned in the Configuration section with brief one-liner descriptions.
- Non-interactive init (`--yes` with env vars) should be noted in the Quick Start as an alternative for CI/scripted setups.
