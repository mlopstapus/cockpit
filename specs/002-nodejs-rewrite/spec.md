# Feature Specification: Cockpit Node.js Rewrite

**Feature Branch**: `002-nodejs-rewrite`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Rewrite Cockpit as a unified Node.js application — replace the Python/FastAPI backend with a Node.js daemon, add a `cockpit init` TUI setup wizard (like `specify init`), and a `cockpit` CLI for ongoing management (status, repos add/remove, token rotation, logs, stop/restart). The daemon polls GitHub for [COCKPIT] issues, spawns Claude Code, manages SQLite state, and posts comments — all in Node.js with no Python dependency."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Setup (Priority: P1)

A developer discovers Cockpit and wants to get it running against their GitHub repo. They run `cockpit init` which walks them through an interactive TUI wizard: entering their GitHub token, choosing which repos to watch, mapping each repo to a local clone path, and installing Cockpit as a background service. At the end they see a summary and Cockpit starts running automatically.

**Why this priority**: Without a working setup flow, no other story is reachable. This is the entry point for every user.

**Independent Test**: Run `cockpit init` against a test GitHub token and repo path; verify the service file is written, the config is persisted, and the daemon starts polling without manual steps.

**Acceptance Scenarios**:

1. **Given** a fresh machine with Node.js and `claude` installed, **When** the user runs `cockpit init`, **Then** the wizard prompts for GitHub token, repos, and local paths in sequence before writing config and installing the background service.
2. **Given** a repo path that does not exist on disk, **When** the user enters it during setup, **Then** the wizard shows a visible warning but allows the user to continue or correct the path.
3. **Given** setup completes successfully, **When** the wizard exits, **Then** the background service has been enabled and started (Linux: `systemctl --user enable --now`; macOS: `launchctl load`), and the user sees a confirmation with next steps including `cockpit status`.
4. **Given** the user runs `cockpit init` a second time, **When** an existing config is detected, **Then** the wizard offers to update the existing config rather than overwriting silently.

---

### User Story 2 - Automated Issue-to-PR Pipeline (Priority: P1)

A developer opens a `[COCKPIT]` prefixed GitHub issue in a watched repo from any device. The Cockpit daemon detects the issue within 60 seconds, posts an acknowledgement comment, runs the full spec-kit pipeline (specify → clarify → plan → tasks → analyze → implement) inside the local repo clone, posts progress comments at each stage, and when complete links the opened PR back to the issue.

**Why this priority**: This is the core value proposition of Cockpit. Everything else supports this flow.

**Independent Test**: Open a `[COCKPIT] test feature` issue in a watched repo; verify a comment appears within 60 seconds acknowledging pickup, subsequent stage-transition comments appear, and a PR is linked when the pipeline completes.

**Acceptance Scenarios**:

1. **Given** a watched repo, **When** a `[COCKPIT]`-prefixed issue is opened by the configured owner, **Then** the daemon detects it within one poll cycle (≤60s default) and posts a "picked up" comment.
2. **Given** a running pipeline, **When** each spec-kit stage completes, **Then** a comment is posted to the issue showing which stage just finished and what is next.
3. **Given** the `clarify` stage generates questions, **When** the developer replies to the issue comment, **Then** the pipeline picks up the reply and passes it to the clarify stage within one poll cycle.
4. **Given** the pipeline completes successfully, **When** Claude opens a PR, **Then** a final comment on the issue contains a direct link to the PR.
5. **Given** a `[COCKPIT]` issue is opened by a non-owner account, **When** the daemon polls, **Then** the issue is silently skipped and no comment is posted.
6. **Given** the same issue is detected on multiple poll cycles before a job starts, **When** the daemon processes it, **Then** only one job is enqueued (deduplication).

---

### User Story 3 - Runtime Management via CLI (Priority: P2)

A developer uses the `cockpit` CLI to check what the daemon is doing, view logs, add a new repo, rotate their GitHub token, or restart the daemon — all without editing config files by hand.

**Why this priority**: After initial setup, operators need visibility and control without restarting from scratch. This story delivers operational confidence.

**Independent Test**: With a running daemon, run `cockpit status` and verify the output shows current job state; run `cockpit repos add owner/repo /path` and verify the repo is polled on the next cycle.

**Acceptance Scenarios**:

1. **Given** the daemon is running, **When** the user runs `cockpit status`, **Then** the output shows daemon health, current job (if any), queue depth, and the list of watched repos.
2. **Given** no job is running, **When** the user runs `cockpit logs`, **Then** the last 50 log lines from the daemon are printed to stdout.
3. **Given** a running daemon, **When** the user runs `cockpit repos add owner/repo /local/path`, **Then** the repo is added to the watch list and the daemon begins polling it on the next cycle without restart.
4. **Given** a repo in the watch list, **When** the user runs `cockpit repos remove owner/repo`, **Then** the repo is removed and no new jobs are created for it.
5. **Given** a new GitHub token, **When** the user runs `cockpit token`, **Then** the wizard prompts for the new token, persists it, and the daemon picks it up without restart.
6. **Given** a running daemon, **When** the user runs `cockpit restart`, **Then** the daemon process is stopped and restarted, picking up any config changes.
7. **Given** the daemon is not running, **When** the user runs `cockpit start`, **Then** the daemon starts in the background and `cockpit status` shows it running.

---

### User Story 4 - Post-Implement Hook (Priority: P3)

After the implement stage completes successfully, Cockpit optionally runs a user-defined shell command (e.g. restart a dev server, send a notification, trigger a build). The outcome is posted as a comment on the issue.

**Why this priority**: Quality-of-life extension. Core pipeline works without it; it exists for users with specific post-deploy needs.

**Independent Test**: Set a `POST_IMPLEMENT_COMMAND` pointing to a script that writes a sentinel file; confirm the sentinel file exists and a success comment appears on the issue after an implement stage.

**Acceptance Scenarios**:

1. **Given** a `POST_IMPLEMENT_COMMAND` is configured, **When** the implement stage completes successfully, **Then** the command is executed and a ✅ comment with the command output is posted to the issue.
2. **Given** the command exits with a non-zero code, **When** it runs after implement, **Then** a ⚠️ comment is posted with the error output, but the overall job status remains completed (not failed).
3. **Given** no `POST_IMPLEMENT_COMMAND` is set, **When** implement completes, **Then** no post-implement step runs and no comment is posted for it.

---

### Edge Cases

- What happens when the local repo clone path does not exist when a job starts? → Job is marked failed immediately with a clear error comment on the issue.
- What happens when Claude Code exits mid-pipeline with a non-zero code? → Job is marked failed, an error comment is posted, and the queue moves to the next job.
- What happens when GitHub API returns rate-limit errors? → The daemon backs off and retries after the rate-limit reset window; no jobs are dropped.
- What happens when two `[COCKPIT]` issues are opened simultaneously? → They are queued FIFO; only one pipeline runs at a time.
- What happens when the daemon crashes while a job is running? → On restart, the in-progress job is marked failed so it can be retried by re-opening the issue.
- What happens when the config file is corrupted or missing on startup? → The daemon refuses to start and prints a clear message directing the user to run `cockpit init`.
- What happens when a watched repo has no local path mapped? → The daemon logs a warning and skips issues from that repo until a path is configured.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single `cockpit` CLI installable via `npm install -g` that serves as both the setup wizard and the management interface.
- **FR-002**: `cockpit init` MUST interactively collect GitHub token, owner, list of repos to watch, and local clone paths for each repo, then persist them to `~/.cockpit/config.json` with file permissions set to `600` (owner read/write only).
- **FR-003**: `cockpit init` MUST detect the host OS and write the appropriate background service definition file (systemd unit on Linux, launchd plist on macOS).
- **FR-004**: The background daemon MUST poll each configured GitHub repo at a configurable interval (default: 30 seconds) for open issues prefixed with `[COCKPIT]`.
- **FR-005**: The daemon MUST only process issues authored by the configured owner account.
- **FR-006**: The daemon MUST deduplicate issues so the same issue is never enqueued more than once while a job for it is active or queued.
- **FR-007**: The daemon MUST execute jobs one at a time in FIFO order.
- **FR-008**: The daemon MUST sanitise GitHub issue title and body (strip control characters) before persisting to the database or passing to Claude Code, then spawn Claude Code inside the local repo clone to run the spec-kit pipeline.
- **FR-009**: The daemon MUST post issue comments at each pipeline stage transition (picked up, each stage, done/failed).
- **FR-010**: The daemon MUST relay replies to clarify-stage issue comments back to the running pipeline process as steering input.
- **FR-011**: The daemon MUST persist all job state and logs to an embedded local database with no external services required. GitHub tokens MUST be redacted (replaced with `[REDACTED]`) from all log lines before storage.
- **FR-012**: `cockpit status` MUST display daemon health, current job details, queue depth, and watched repo list.
- **FR-013**: `cockpit logs [job-id]` MUST display the last 50 lines of daemon logs, or the full log for a specific job if a job ID is provided.
- **FR-014**: `cockpit repos add <owner/repo> <local-path>` MUST add a repo to the watch list by writing to `config.json`; the daemon re-reads `config.json` at the start of each poll cycle so the change takes effect without restart.
- **FR-015**: `cockpit repos remove <owner/repo>` MUST remove a repo from the watch list by writing to `config.json`; takes effect on the next poll cycle without a daemon restart.
- **FR-016**: `cockpit token` MUST prompt for a new GitHub token and persist it to `config.json`; the daemon picks it up on the next poll cycle without restart.
- **FR-017**: `cockpit stop` and `cockpit restart` MUST control the daemon lifecycle.
- **FR-018**: `cockpit start` MUST start the daemon if it is not already running.
- **FR-019**: If `POST_IMPLEMENT_COMMAND` is configured, the daemon MUST execute it after a successful implement stage and post the outcome as an issue comment.
- **FR-020**: The system MUST operate with no Python or Redis dependency — all runtime components MUST be Node.js.

### Key Entities

- **Config**: Persisted user settings — GitHub token, owner, repos-to-watch with local paths, poll interval, post-implement command. Lives at `~/.cockpit/config.json` with file permissions `600` (owner read/write only).
- **Job**: A unit of pipeline work tied to one GitHub issue. Tracks ID, repo, issue number, current stage, status (queued/active/completed/failed/cancelled), and timestamps.
- **Job Log**: Ordered lines of output captured from the Claude process for a given job. Capped at a maximum number of lines per job to prevent unbounded growth.
- **Active PR**: A pull request opened by a completed pipeline job. Links to the originating job and issue for comment relay.
- **Seen Comment**: A deduplication record tracking which GitHub comments have already been processed to prevent double-posting or double-relaying.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior Cockpit setup can complete `cockpit init` and have the daemon polling GitHub in under 5 minutes.
- **SC-002**: A `[COCKPIT]` issue is detected and acknowledged (comment posted) within 60 seconds of being opened, on the default poll interval.
- **SC-003**: All pipeline stage transitions produce visible issue comments within 30 seconds of each stage completing.
- **SC-004**: All `cockpit` CLI commands (`status`, `logs`, `repos add/remove`, `token`, `stop`, `restart`) respond in under 2 seconds.
- **SC-005**: Adding a new repo via `cockpit repos add` takes effect on the next poll cycle with no daemon restart required.
- **SC-006**: Zero external service dependencies at runtime — no Redis, no Docker, no Python — verified by running `cockpit init` successfully on a machine with only Node.js and `claude` installed.
- **SC-007**: When a pipeline job fails, the issue receives an error comment and the queue continues processing the next job within one poll cycle.

## Clarifications

### Session 2026-03-24

- Q: How should the stored GitHub token be protected at rest? → A: Store in `~/.cockpit/config.json` with file permissions set to `600` (owner read/write only).
- Q: How should the daemon detect config changes made by the CLI (for live reload without restart)? → A: Poll — re-read `config.json` at the start of every GitHub poll cycle.
- Q: Should the Node.js rewrite support multiple Claude accounts for rate-limit rotation? → A: No — single account only. Multi-account rotation deferred to backlog.

## Assumptions

- `claude` (Claude Code CLI) is already installed on the host machine; `cockpit init` validates this prerequisite and exits with an error if not found.
- `git` is available on the host machine; `cockpit init` validates this.
- The user has a GitHub personal access token with `repo` scope.
- Local repo clones already exist on disk before setup; Cockpit does not clone repos itself.
- `specify-cli` (spec-kit) is required for the pipeline; `cockpit init` installs it via `uv tool install specify-cli` if `uv` is available, otherwise prints manual instructions.
- The system runs on Linux (systemd) or macOS (launchd); Windows is out of scope for this release.
- Multi-account Claude rate-limit rotation is out of scope for this release and deferred to a future backlog item. The daemon uses a single Claude configuration.
- One job runs at a time; parallel job execution is out of scope.
- The management CLI communicates with the daemon via the local filesystem/database rather than a network socket, keeping the architecture simple and offline-friendly. Config changes are picked up by the daemon on the next poll cycle — no IPC or file-watcher required.
