# Feature Specification: Generalize Cockpit for Any Project

**Feature Branch**: `001-generalize-cockpit`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "I would like to make it so this repo is generalized and configurable to any repo/project. Right now cockpit works for seamless (my app) I'd like to generalize it so anyone could use it. What is popular is node packages for configuring (similar to how claude runs and configures) that could be useful especially to set up the systemctl process for the agent, tailscale, and (in my case only) expo go."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Setup via Interactive CLI (Priority: P1)

A developer wants to use Cockpit for their own project. They run a single command (`npx cockpit-setup` or similar) that asks them a series of questions — which GitHub repo to watch, where the local clone lives, their GitHub token — and produces a ready-to-run `.env` file and systemd service configuration on their machine. As part of setup, the CLI installs spec-kit into the target repo and walks the user through creating a project constitution for that repo. No manual editing of service files or environment files is required.

**Why this priority**: This is the core blocker to adoption. Without a simple setup path, only the original author can use Cockpit. Getting a new user running in under 15 minutes is the primary goal.

**Independent Test**: A developer who has never seen the codebase can run one command, answer the prompts, and have Cockpit watching their repo — deliverable standalone without any other story.

**Acceptance Scenarios**:

1. **Given** a developer has `node` installed and has cloned the cockpit repo, **When** they run the setup CLI, **Then** they are interactively prompted for their GitHub token, owner, repo(s), and local repo path(s), and a valid `.env` file is written.
2. **Given** the setup CLI reaches the spec-kit phase, **When** the user confirms, **Then** `specify-cli` is installed via `uv tool install` and the user is shown clear next-step instructions (`specify init --here --ai claude` and `/speckit.constitution`).
3. **Given** a developer completes the setup CLI, **When** they inspect the generated config, **Then** all hardcoded references to `mlopstapus/seamless` or Expo are absent unless they explicitly opted into those.
4. **Given** a developer runs setup on Linux, **When** setup completes, **Then** a systemd service unit file is written and instructions are printed to enable and start it.
5. **Given** a developer runs setup on macOS, **When** setup completes, **Then** a launchd plist file is written and instructions are printed to load it with `launchctl`.
6. **Given** a developer skips an optional field (e.g., Tailscale, post-implement hooks), **When** Cockpit runs, **Then** those features are simply disabled with no error.

---

### User Story 2 - Configurable Post-Implement Hook (Priority: P2)

After a successful `implement` stage, Cockpit currently restarts a hardcoded Expo dev server (`seamless-expo`). A new user's project may have a different post-implement action — restarting a Next.js dev server, running a deploy script, or nothing at all. The hook should be a generic, configurable shell command rather than Expo-specific logic in the source code.

**Why this priority**: Removes the biggest project-specific coupling in the pipeline. A user with a non-Expo project would otherwise see Expo errors on every job completion.

**Independent Test**: Configure a post-implement hook pointing to an arbitrary shell command; run a pipeline end-to-end and confirm the hook fires (or is skipped when unset).

**Acceptance Scenarios**:

1. **Given** `POST_IMPLEMENT_COMMAND` is set in `.env`, **When** a pipeline job completes the implement stage successfully, **Then** that command is executed and its success/failure is logged to the GitHub issue comment.
2. **Given** `POST_IMPLEMENT_COMMAND` is not set, **When** a pipeline job completes the implement stage, **Then** no post-implement action runs and no error is raised.
3. **Given** `POST_IMPLEMENT_COMMAND` is set but exits non-zero, **When** it runs after implement, **Then** a warning comment is posted to the issue and the pipeline still completes successfully.

---

### User Story 3 - Replace Redis/Docker with Embedded Storage (Priority: P1)

Cockpit currently requires Redis (run via docker-compose) as a dependency for its job queue and state store. This is unnecessary complexity for a tool designed to run on a single dev box processing one job at a time. Docker must be removed as a dependency; all state must be managed by an embedded, zero-dependency store that survives process restarts.

**Why this priority**: Docker/Redis is a hard install requirement that blocks adoption for anyone who doesn't already have it running. Removing it is as important to adoption as the setup CLI itself.

**Independent Test**: Remove the docker-compose setup entirely; start Cockpit with no Docker running; create a `[COCKPIT]` issue; verify the pipeline runs end-to-end with all state persisted correctly.

**Acceptance Scenarios**:

1. **Given** Docker is not installed on the machine, **When** Cockpit starts, **Then** it starts successfully with no errors about missing Redis.
2. **Given** a job is in progress and Cockpit is restarted, **When** Cockpit comes back up, **Then** job state is recovered from the embedded store.
3. **Given** `docker-compose.yml` is removed from the repo, **When** a new user follows setup instructions, **Then** there is no mention of Docker or Redis in the setup flow.

---

### User Story 4 - Update Outdated Documentation (Priority: P2)

The CLAUDE.md, README (if present), `.env.example`, and service files contain outdated references, Docker instructions, and project-specific details that no longer reflect how Cockpit works. All documentation must be audited and updated to reflect the generalized, Docker-free, setup-CLI-based workflow.

**Why this priority**: A new user's first experience is the documentation. Outdated docs erode trust and cause failed setups.

**Independent Test**: A developer follows only the updated documentation from a fresh clone and successfully runs Cockpit watching their own repo.

**Acceptance Scenarios**:

1. **Given** a developer reads CLAUDE.md, **When** they follow the "Running" instructions, **Then** the instructions reference the setup CLI and contain no Docker/docker-compose steps.
2. **Given** `.env.example` is read, **When** no env vars are set, **Then** all values are generic placeholders with inline comments explaining each variable; GitHub Secrets is documented as a future alternative.
3. **Given** the systemd/launchd service files are read, **When** they contain no hardcoded usernames or project names, **Then** they work as templates that setup CLI fills in.

---

### User Story 5 - Remove All Hardcoded Project References (Priority: P2)

The existing codebase contains hardcoded references to `mlopstapus`, `seamless`, and `seamless-expo` scattered across config defaults, service files, and environment examples. Any new user must currently find and replace these manually. All such references must be parameterized so that cloning the repo and running setup is sufficient — no source-code edits required.

**Why this priority**: Hardcoded references create subtle bugs (wrong default owner, wrong service name) that are hard for new users to diagnose. This is table-stakes for a distributable tool.

**Independent Test**: Clone the repo fresh; run setup with a different GitHub owner/repo; start Cockpit; create a `[COCKPIT]` issue — verify no `mlopstapus` or `seamless` strings appear in logs, comments, or errors.

**Acceptance Scenarios**:

1. **Given** a fresh clone with a different GitHub owner configured, **When** Cockpit starts, **Then** no log lines or GitHub comments reference `mlopstapus` or `seamless`.
2. **Given** `config.py` and `.env.example` are read, **When** no environment variables are set, **Then** default values are clearly labeled as examples (e.g., `your-username`) rather than real project identifiers.

---

### Edge Cases

- What happens when `POST_IMPLEMENT_COMMAND` contains shell special characters or spaces?
- How does setup handle repos where the local clone doesn't yet exist at setup time?
- What if the user runs setup a second time — does it overwrite or prompt before overwriting? → Prompt "`.env` already exists — overwrite? [y/N]"; overwrite on yes, abort on no. The `--yes` flag skips the prompt and overwrites.
- What if `node` is not installed and the user tries to use the setup CLI?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an interactive setup CLI that guides a new user through configuration without requiring manual editing of source files.
- **FR-001a**: Setup CLI MUST install `specify-cli` (spec-kit) as a persistent `uv` tool via `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`.
- **FR-001b**: Setup CLI MUST print clear next-step instructions after spec-kit is installed: `specify init --here --ai claude` to initialise the target repo, and `/speckit.constitution` to build the project constitution in the user's AI assistant. The CLI does NOT invoke these commands automatically.
- **FR-002**: Setup CLI MUST generate a valid `.env` file and the appropriate service file for the host OS: a systemd unit file on Linux, or a launchd plist on macOS. The OS MUST be auto-detected at setup time.
- **FR-003**: System MUST support a generic `POST_IMPLEMENT_COMMAND` environment variable that replaces the hardcoded Expo restart logic.
- **FR-004**: System MUST execute `POST_IMPLEMENT_COMMAND` (if set) after every successful implement stage and post the result as an issue comment.
- **FR-005**: System MUST gracefully skip post-implement actions when `POST_IMPLEMENT_COMMAND` is unset, without errors or warnings.
- **FR-006**: *(Removed — Tailscale/VPN setup is documented but not a product feature in this release.)*
- **FR-006a**: System MUST remove docker-compose as a dependency; Docker MUST NOT be required to run Cockpit.
- **FR-006b**: All job queue, state, log, and dedup storage currently backed by Redis MUST be replaced with an embedded, zero-dependency store that persists across process restarts without an external service.
- **FR-007**: All hardcoded references to `mlopstapus`, `seamless`, and `seamless-expo` MUST be replaced with configurable values or generic placeholders in defaults and examples.
- **FR-008**: `.env.example` MUST use generic placeholder values (e.g., `your-github-username`, `your-repo`) rather than real project identifiers.
- **FR-009**: Setup CLI MUST provide a `--yes` / non-interactive mode for automated or scripted installs.
- **FR-010**: Setup CLI MUST detect if a `.env` already exists and prompt "`.env` already exists — overwrite? [y/N]" before overwriting. The `--yes` flag bypasses this prompt and overwrites automatically.
- **FR-011**: Documentation MUST include migration guidance explaining that existing Expo users can set `POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo` to preserve the previous Expo restart behavior with no change in behavior.
- **FR-012**: The setup CLI MUST NOT attempt to invoke `/speckit.constitution` automatically; it MUST instead print instructions for the user to run `specify init --here --ai claude` and then `/speckit.constitution` in their AI assistant.

### Key Entities

- **CockpitConfig**: The set of environment variables and derived settings that control all Cockpit behavior for a given installation. Contains repo targets, auth tokens, and post-implement hook.
- **JobStore**: The embedded persistent store (replacing Redis) that holds job queue, job state, append-only logs, comment dedup set, and active PR tracking.
- **SetupProfile**: The answers collected during an interactive setup session — used to render `.env`, service unit templates, and the target repo's constitution.
- **PostImplementHook**: A shell command string stored in config, executed after a successful implement stage via `/bin/sh -c`. Supports full shell syntax (pipes, `&&`, env vars). Replaces the Expo-specific restart logic.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer unfamiliar with Cockpit can run setup, have spec-kit installed in their target repo, complete a constitution, and have Cockpit watching their GitHub repo — all with no manual source-code edits — in under 15 minutes.
- **SC-002**: Zero references to `mlopstapus`, `seamless`, or `seamless-expo` appear in logs, GitHub comments, or generated files for a new-user installation that does not configure Expo.
- **SC-003**: Existing users (with Expo) experience no change in behavior after migration — the Expo restart continues to fire via the new generic hook mechanism.
- **SC-004**: 100% of post-implement hook outcomes (success, failure, skipped) are reported in the GitHub issue comment thread.
- **SC-005**: The setup CLI completes without error on macOS and Linux (the two platforms Cockpit targets).
- **SC-006**: Cockpit starts and runs a complete pipeline end-to-end with no Docker, Redis, or any external service dependency.

## Assumptions

- The setup CLI is distributed as part of the Cockpit repo (e.g., a `setup/` directory with a Node.js script invokable via `node setup/index.js` or `npx`), not as a separately published npm package — publishing to npm is out of scope for this feature.
- "Systemctl setup" means generating the unit file and printing the commands to install it; the CLI does not run `sudo systemctl enable` itself, as that requires elevated permissions.
- The existing Expo-specific `_restart_expo` method and `EXPO_RESTART_ENABLED` env var are replaced by the generic `POST_IMPLEMENT_COMMAND` approach; no separate Expo-specific code path remains.
- Tailscale/VPN setup is out of scope as a product feature; it is documented in `.env.example` and CLAUDE.md as an optional networking approach but Cockpit does not configure or require it.
- Docker-compose and Redis are removed entirely; an embedded store (SQLite via aiosqlite) replaces all Redis usage.
- The setup CLI targets Node.js 18+ (LTS), consistent with the project's existing Node dependency for Claude Code CLI.
- `uv` must be installed on the user's machine for spec-kit install to work; the setup CLI checks for `uv` on PATH and prints install instructions if missing (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
- GitHub Secrets/Environments as an alternative config source is out of scope for this feature; `.env.example` will document it as a future path.

## Clarifications

### Session 2026-03-23

- Q: How should the setup CLI handle service management on macOS vs Linux? → A: Auto-detect OS; generate systemd unit on Linux, launchd plist on macOS.
- Q: Should this feature include a GitHub Secrets-based config path (per updated constitution)? → A: No — local `.env` only; document GitHub Secrets as a future alternative in `.env.example`.
- Q: How should POST_IMPLEMENT_COMMAND be executed — shell expansion or argv? → A: Via `/bin/sh -c`; full shell syntax (pipes, `&&`, env vars) supported.
- Q: What happens when setup is run a second time and `.env` already exists? → A: Prompt "overwrite? [y/N]"; overwrite on yes, abort on no. `--yes` skips prompt.
