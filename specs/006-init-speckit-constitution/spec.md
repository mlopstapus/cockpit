# Feature Specification: Enhanced Cockpit Initialization with Spec-Kit and Constitution Setup

**Feature Branch**: `006-init-speckit-constitution`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "cockpit initialization: When I initialize the package it should install github spec-kit and it should walk them through building a constitution in their project. In addition, when I initialize the project and install cockpit I want it to initialize using a repo (aka path from root) or a github repo address that it can clone using your PAT."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clone a Repo by GitHub Address During Init (Priority: P1)

A developer setting up Cockpit for the first time wants to point it at a GitHub repository they haven't cloned yet. During `cockpit init`, when adding a repo, Cockpit asks: **"Have you already cloned this repo locally?"** The user answers **No**, then provides the GitHub repository address (e.g., `owner/repo` or a full HTTPS URL). Cockpit uses the already-configured GitHub PAT to clone the repo to a chosen local destination, then registers it as a watched repo.

**Why this priority**: This removes the most common friction point in setup — needing a local clone before running `cockpit init`. It makes the first-run experience self-contained.

**Independent Test**: Run `cockpit init`, answer "No" to the "already cloned?" prompt, provide a GitHub repo address, confirm a clone destination, and verify the repo appears cloned locally and registered in `~/.cockpit/config.json`.

**Acceptance Scenarios**:

1. **Given** the user has not yet cloned the target repo, **When** they enter a GitHub address (`owner/repo` or HTTPS URL) during the repo setup step of `cockpit init`, **Then** Cockpit clones the repo using the configured PAT into the specified local directory and registers it as a watched repo.
2. **Given** the user provides a valid GitHub repo address, **When** Cockpit attempts to clone it, **Then** clone progress is shown and the user is informed of success with the local path used.
3. **Given** the user provides an invalid or inaccessible GitHub repo address, **When** Cockpit attempts to clone it, **Then** a clear error message is shown, the repo is not registered, and the user is prompted to try again.
4. **Given** the destination directory already exists and is non-empty, **When** Cockpit attempts to clone, **Then** Cockpit warns the user and asks them to confirm or choose a different path before proceeding.

---

### User Story 2 - Install Spec-Kit into a Watched Repo During Init (Priority: P2)

After a repo is registered during `cockpit init`, the developer is offered the option to install spec-kit into that repo. Cockpit bootstraps the spec-kit scaffolding (template files, scripts, and directory structure) into the repo's working tree so the repo is immediately ready for the spec pipeline.

**Why this priority**: Without spec-kit installed in the target repo, Cockpit's spec pipeline (`specify → clarify → plan → tasks → analyze → implement`) cannot run. Bundling this step into `cockpit init` eliminates a separate manual setup requirement.

**Independent Test**: Run `cockpit init`, register a repo (local path or newly cloned), opt into spec-kit installation, and verify the `.specify/` directory and its standard contents are present in the repo.

**Acceptance Scenarios**:

1. **Given** a repo is registered during init, **When** the user opts into spec-kit installation, **Then** the spec-kit scaffolding is written into the repo at the standard location and the user is informed of what was installed.
2. **Given** spec-kit is already present in the target repo, **When** the user opts into spec-kit installation, **Then** Cockpit detects the existing installation, informs the user, and asks whether to skip or overwrite.
3. **Given** the user declines spec-kit installation during init, **When** init completes, **Then** the repo is still registered as a watched repo and spec-kit installation is skipped without error.
4. **Given** spec-kit installation fails (e.g., write permission denied), **When** the failure occurs, **Then** Cockpit reports the error clearly and the repo remains registered so the user can retry manually.

---

### User Story 3 - Walk Through Constitution Creation During Init (Priority: P3)

After spec-kit is installed in a repo, the developer is guided through an interactive wizard to create a project constitution — a markdown document that captures the project's core principles, security requirements, development workflow, and governance rules. The resulting file is written into the repo's spec-kit directory.

**Why this priority**: The constitution guides all future autonomous agent sessions. Without it, spec-kit sessions run without project-specific guardrails. This wizard ensures new projects start with a constitution rather than deferring it.

**Independent Test**: Run `cockpit init`, install spec-kit into a repo, proceed through the constitution wizard, and verify a `constitution.md` file is present in the spec-kit memory directory with the user's answers reflected.

**Acceptance Scenarios**:

1. **Given** spec-kit is installed, **When** the user proceeds through the constitution wizard, **Then** they are guided through 4–6 prompts — one per major section (core principles, security requirements, development workflow, governance) — each with a pre-filled default they can accept or edit, using the `@clack/prompts` UI consistent with the rest of `cockpit init`.
2. **Given** the user provides answers to constitution prompts, **When** the wizard completes, **Then** a `constitution.md` file is written to the spec-kit memory directory with the user's choices reflected.
3. **Given** a constitution already exists in the repo, **When** the wizard is reached during init, **Then** the user is informed and offered the choice to skip, view, or overwrite the existing constitution.
4. **Given** the user skips the constitution wizard, **When** init completes, **Then** no constitution file is written and the user is shown a reminder that it can be created later via `cockpit init` or directly via spec-kit commands.

---

### User Story 4 - Provide a Local Path as Before (Priority: P1)

An existing or returning user answers **"Yes"** to the "Have you already cloned this repo locally?" prompt during `cockpit init`, then provides the local directory path. This is the primary path for existing or returning users and must continue to work exactly as before.

**Why this priority**: Existing users must not be broken. The new GitHub-clone path is additive, not a replacement.

**Independent Test**: Run `cockpit init`, enter an existing local path when prompted, and confirm the repo is registered without any clone attempt.

**Acceptance Scenarios**:

1. **Given** the user enters a local path that exists and is a git repo, **When** they proceed through init, **Then** the repo is registered normally as a watched repo.
2. **Given** the user enters a local path that does not exist or is not a git repo, **When** they proceed through init, **Then** a clear error is shown and they are prompted to re-enter.

---

### Edge Cases

- What happens when the PAT lacks permission to clone the specified GitHub repo?
- What happens when the target clone destination has insufficient disk space?
- What happens if the network is unavailable when cloning is attempted?
- What happens if Cockpit is re-initialized for a repo that already has spec-kit and a constitution?
- What happens if the user provides a GitHub SSH URL instead of HTTPS?
- What happens if the constitution wizard is interrupted midway?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: During `cockpit init`, when adding a repo, Cockpit MUST ask **"Have you already cloned this repo locally?"**. If yes, prompt for the local path. If no, prompt for the GitHub repository identifier (e.g., `owner/repo` or full HTTPS URL) and proceed to clone it.
- **FR-002**: When a GitHub repository identifier is provided, Cockpit MUST clone the repository to a user-specified local destination using the GitHub PAT already collected earlier in the init flow.
- **FR-003**: Cockpit MUST display clone progress and confirm the local path upon successful clone.
- **FR-004**: Cockpit MUST surface a clear, actionable error message if cloning fails (invalid repo, insufficient permissions, network error, non-empty destination) and allow the user to retry.
- **FR-005**: After a repo is registered (whether via local path or clone), Cockpit MUST offer the user the option to install spec-kit into that repo.
- **FR-006**: When spec-kit installation is accepted, Cockpit MUST invoke the spec-kit CLI as `specify init <local-repo-path> --ai claude` to install spec-kit into the target repo.
- **FR-007**: Cockpit MUST verify `specify` is available on PATH before attempting installation; if absent, surface a clear error instructing the user to install it first (`pip install specify-cli` or `uv tool install specify-cli`). Cockpit MUST NOT pre-check for `.specify/` — `specify init` owns the existing-installation check. Cockpit streams `specify init` output to the user and treats a non-zero exit as a failure requiring explicit user acknowledgement before continuing.
- **FR-008**: After spec-kit is installed (or if it was already present and the user confirmed), Cockpit MUST offer to guide the user through a constitution creation wizard.
- **FR-009**: The constitution wizard MUST present exactly one prompt per major section — core principles, security requirements, development workflow, and governance — each with a pre-filled suggested default that the user can accept or edit (~4–6 prompts total). Prompts MUST use `@clack/prompts` consistent with the rest of `cockpit init`.
- **FR-010**: Completed constitution content MUST be written to the spec-kit memory directory within the target repo.
- **FR-011**: If a constitution already exists, Cockpit MUST inform the user and offer skip, view, or overwrite options.
- **FR-012**: All new init steps (clone, spec-kit install, constitution wizard) MUST be skippable individually — declining any step MUST NOT abort the overall init flow.
- **FR-013**: The non-interactive init path (`cockpit init --yes`) MUST support the new GitHub repo address input via environment variable and MUST skip spec-kit install and constitution wizard unless explicitly opted in.

### Key Entities

- **Repo Registration**: A watched repo entry with an identifier (GitHub address or local path), resolved local path, and startup command.
- **Spec-Kit Scaffolding**: The set of directories, template files, and scripts that constitute a spec-kit installation in a project repo.
- **Constitution**: A markdown document capturing the project's principles, security requirements, workflow, and governance rules, stored in the spec-kit memory directory.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user completing `cockpit init` with a GitHub repo address can have a fully cloned, spec-kit-enabled, constitution-equipped repo registered in under 5 minutes without leaving the terminal.
- **SC-002**: 100% of existing init flows using local paths continue to work without modification after this change.
- **SC-003**: A user who opts into spec-kit installation and the constitution wizard during init can start a spec pipeline (`/speckit.specify`) in the newly configured repo without any additional manual setup.
- **SC-004**: Clone failures, permission errors, and pre-existing installations are surfaced with actionable messages — users never encounter a silent failure or an aborted init.
- **SC-005**: The non-interactive (`--yes`) init path can be fully scripted via environment variables for CI/onboarding automation scenarios.

## Clarifications

### Session 2026-03-25

- Q: How is spec-kit distributed — bundled inside the Cockpit package, fetched from a dedicated public GitHub repo at init time, or copied from Cockpit's own `.specify/` directory? → A: ~~Fetched from a dedicated public GitHub repo at init time.~~ *Superseded by Q4 answer: installed via the `specify` CLI.*
- Q: How is the GitHub PAT credential passed to the git clone operation — credential helper, embedded in URL, or system git credential store? → A: The PAT is already collected earlier in the init flow and is available in-process at clone time; no separate credential handoff is needed.
- Q: How deep should the constitution wizard be — fully guided per sub-section, one prompt per major section with defaults, single free-text description, or copy template as-is? → A: One prompt per major section (core principles, security requirements, workflow, governance) with pre-filled defaults the user can accept or edit — ~4–6 prompts total (Option B).
- Q: How should spec-kit be installed into the target repo — git clone + copy, tarball download, sparse checkout, or CLI tool? → A: Use the spec-kit CLI: `specify init <local-repo-path> --ai claude`.
- Q: Who owns the "already installed" check for spec-kit — Cockpit pre-checks `.specify/` and asks skip/overwrite, or `specify init` handles it and Cockpit only acts on exit code? → A: Option A — Cockpit checks PATH for `specify`, invokes `specify init`, streams output, and fails loudly on non-zero exit; `specify init` owns the existing-installation check.

## Assumptions

- Spec-kit is installed via `specify init <local-repo-path> --ai claude`. The `specify` CLI must already be installed on the user's system; Cockpit does not install it.
- The GitHub PAT entered during `cockpit init` has sufficient scope to clone private repositories the user intends to watch.
- HTTPS cloning is the supported protocol; SSH URLs are out of scope for this feature.
- The constitution template used in the wizard is derived from the existing spec-kit constitution template (`.specify/templates/constitution-template.md`).
- The `cockpit init --yes` non-interactive path defaults to skipping spec-kit installation and constitution wizard unless additional flags or env vars are provided.
