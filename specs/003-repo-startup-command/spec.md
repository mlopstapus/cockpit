# Feature Specification: Repo Startup Commands

**Feature Branch**: `003-repo-startup-command`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "startup commands: When I configure Cockpit for a certain repo I want to be able to pass in a startup command for my app. For example, if I am working on a docker compose app, I want to be able to tell Cockpit to run docker compose up -d --build each time to make sure the app is reloaded. For a mobile app I am testing on expo go I want to run something like my cockpit/scripts/start-expo.sh commands (which I don't think are necessary anymore) and make sure the docker compose is up and running. This is the glue that maps updates to where the user can validate them."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Startup Command Per Repo (Priority: P1)

As a Cockpit user, I want to configure a shell command that runs automatically after each implement stage completes for a specific repo, so that my app is always in a running/testable state when I go to validate the changes.

**Why this priority**: Without a running app, there is nothing to validate. This is the core value of the feature — closing the gap between "code written" and "changes visible to user."

**Independent Test**: Can be fully tested by adding a `startupCommand` to a repo config entry, triggering a [COCKPIT] issue, and observing that the command executes after the implement stage and before the job is marked complete.

**Acceptance Scenarios**:

1. **Given** a repo config entry has a `startupCommand` set, **When** the implement stage finishes successfully, **Then** Cockpit runs that command in the repo's `localPath` directory.
2. **Given** a repo config entry has no `startupCommand`, **When** the implement stage finishes, **Then** Cockpit proceeds normally with no startup command executed (backward compatible).
3. **Given** a `startupCommand` is configured, **When** Cockpit processes a new job for that repo, **Then** the startup command runs every time after implement completes, not just on the first run.

---

### User Story 2 - Startup Command Result Reported in Issue (Priority: P2)

As a Cockpit user reviewing results on GitHub mobile, I want to see whether the startup command succeeded or failed as part of the issue comments, so that I know if my app is ready to test or if something went wrong with the startup.

**Why this priority**: Without feedback, the user has no way to know if the startup command worked, defeating the purpose of the feature.

**Independent Test**: Can be tested by configuring a command that sometimes exits non-zero and verifying the resulting issue comment reflects the outcome.

**Acceptance Scenarios**:

1. **Given** the startup command exits successfully (exit code 0), **When** the job completes, **Then** the issue comment indicates the app was started successfully.
2. **Given** the startup command exits with a non-zero code, **When** the job completes, **Then** the issue comment reports the startup failure and includes enough output for diagnosis.
3. **Given** the startup command produces output, **When** reporting status, **Then** relevant output (last N lines) is included in the comment for context.

---

### User Story 3 - Add/Update Startup Command via CLI (Priority: P3)

As a Cockpit user, I want to be able to add or update a startup command for an existing repo using the CLI, so that I don't have to manually edit the config file.

**Why this priority**: Power users will configure repos via CLI. Direct config editing also works, but CLI discoverability is important.

**Independent Test**: Can be tested by running `cockpit repos add` with a `--startup-command` flag and verifying the config is updated correctly.

**Acceptance Scenarios**:

1. **Given** I run `cockpit repos add owner/repo /local/path --startup-command "docker compose up -d --build"`, **Then** the repo entry is saved with the startup command in config.
2. **Given** a repo already exists in config, **When** I update it with a new startup command via CLI, **Then** the existing entry is updated without removing the repo.
3. **Given** I configure a startup command with special characters or spaces (e.g., a path to a shell script), **Then** the command is stored and executed correctly.

---

### Edge Cases

- What happens if the startup command hangs indefinitely? A configurable or default timeout applies; the job is marked failed after timeout.
- What if the startup command is a path to a script that does not exist? Non-zero exit, failure reported in issue comment.
- What if the startup command requires environment variables not present in the daemon's environment? The command inherits the daemon's environment; user is responsible for ensuring required env vars are available.
- What if two jobs queue up for the same repo? The startup command runs once per completed implement stage (once per job).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a per-repo optional `startupCommand` field in the repo configuration.
- **FR-002**: System MUST execute the `startupCommand` automatically after each successful implement stage for the repo.
- **FR-003**: System MUST execute the `startupCommand` in the repo's configured `localPath` as the working directory.
- **FR-004**: System MUST report the outcome (success or failure) of the startup command as an issue comment.
- **FR-005**: System MUST include relevant output from the startup command in the failure report (last N lines of stdout/stderr).
- **FR-006**: System MUST apply a timeout to the startup command execution to prevent indefinite hangs; if the command exceeds the timeout the job is marked failed.
- **FR-007**: System MUST remain backward compatible — repos without a `startupCommand` configured behave identically to current behavior.
- **FR-008**: The `cockpit repos add` CLI command MUST accept an optional `--startup-command` flag to set the startup command when adding a repo.
- **FR-009**: System MUST skip the startup command step and proceed normally when no `startupCommand` is configured.

### Key Entities

- **Repo Config Entry**: Existing per-repo configuration object, extended with an optional `startupCommand` string field. Represents the command to run after implement, executed in `localPath`.
- **Startup Command Result**: Outcome of running the startup command — includes exit code, captured output snippet, and elapsed time. Used to populate the issue comment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a successful implement stage, the startup command runs and completes within a reasonable timeout (default: 5 minutes) without manual intervention.
- **SC-002**: 100% of jobs for repos with a `startupCommand` configured result in an issue comment that reflects startup success or failure.
- **SC-003**: Repos without a `startupCommand` show no change in behavior — zero regressions in existing flows.
- **SC-004**: A user can configure a startup command for a new repo via a single CLI invocation without editing config files directly.
- **SC-005**: A user reviewing the GitHub issue can determine within 30 seconds whether the app started successfully, based solely on the issue comment.

## Assumptions

- The startup command is a single shell command string (not an array), executed via the system shell (`sh -c`), consistent with the existing `postImplementCommand` pattern.
- The default timeout for startup commands is 5 minutes; this may be made configurable in a future iteration.
- The startup command inherits the daemon process's environment variables.
- Output capture is limited to the last 50 lines of combined stdout/stderr to avoid extremely large issue comments.
- The feature replaces the need for external wrapper scripts by making the startup step a first-class config option per repo.
- The global `postImplementCommand` config field (if set) runs in addition to the per-repo `startupCommand`; the per-repo command runs after the global one.
