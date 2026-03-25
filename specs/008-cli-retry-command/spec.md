# Feature Specification: CLI Retry Command

**Feature Branch**: `008-cli-retry-command`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "retry: Add `cockpit retry <job-id>` CLI command to requeue a failed job without touching the database directly. Should reset `status → queued`, `stage → idle`, `error → NULL` for the given job ID. Optionally support `cockpit retry --last` to retry the most recently failed job without needing to know the ID." *(stage behaviour superseded by clarification — see §Clarifications)*

## Clarifications

### Session 2026-03-25

- Q: Does retrying a job restart the full pipeline from the beginning or resume from the stage where it previously failed? → A: Resume from the failed stage (stage field is preserved; only status and error are reset).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retry a Failed Job by ID (Priority: P1)

An operator runs `cockpit retry <job-id>` to requeue a specific failed job. The job was previously processed and ended in a failed state (e.g., Claude errored, rate-limited, or the spec pipeline crashed). Rather than manipulating the database by hand, the operator uses the CLI to reset the job and let the daemon pick it up again.

**Why this priority**: This is the core of the feature. Without the ability to retry by ID, the feature has no value. It unblocks stuck pipelines without requiring database access.

**Independent Test**: Can be fully tested by creating a failed job record, running `cockpit retry <job-id>`, and confirming the job re-appears in the active queue and runs.

**Acceptance Scenarios**:

1. **Given** a job exists with `status = failed`, **When** the operator runs `cockpit retry <job-id>`, **Then** the job's status resets to `queued`, the stage remains at the stage where the job failed, and the error clears — and the daemon resumes from that stage on the next poll cycle.
2. **Given** a job exists with `status = failed`, **When** the operator runs `cockpit retry <job-id>`, **Then** the CLI prints a confirmation message with the job ID.
3. **Given** a job ID that does not exist, **When** the operator runs `cockpit retry <nonexistent-id>`, **Then** the CLI exits with a non-zero code and prints an error identifying the unknown job ID.
4. **Given** a job with `status = active` or `status = queued`, **When** the operator runs `cockpit retry <job-id>`, **Then** the CLI exits with a non-zero code and prints an error explaining the job is not in a retryable state.

---

### User Story 2 - Retry the Most Recently Failed Job (Priority: P2)

An operator does not know the exact job ID but wants to retry the last thing that failed. They run `cockpit retry --last` as a convenience shortcut — no need to look up IDs in `cockpit logs` or `cockpit status`.

**Why this priority**: The `--last` flag reduces friction for the most common case. After a pipeline fails, the operator typically wants to retry that exact job. Knowing the ID should not be a prerequisite.

**Independent Test**: Can be fully tested independently — create a failed job, run `cockpit retry --last`, and confirm the correct job is requeued and executed.

**Acceptance Scenarios**:

1. **Given** one or more failed jobs exist, **When** the operator runs `cockpit retry --last`, **Then** the most recently failed job is requeued, and the CLI confirms which job ID was retried.
2. **Given** no failed jobs exist, **When** the operator runs `cockpit retry --last`, **Then** the CLI exits with a non-zero code and prints a clear message that there are no failed jobs to retry.

---

### Edge Cases

- What happens when a job was previously retried multiple times and hit the automatic retry cap? Manual retry via `cockpit retry` bypasses the automatic retry cap — if an operator explicitly retries, they have acknowledged the prior failures.
- What if the database file does not exist or is inaccessible? The CLI exits with a clear error message rather than crashing silently.
- What if `cockpit retry --last` is run while another job is currently running? The last-failed job is still requeued normally; no special handling needed.
- What if `<job-id>` is provided at the same time as `--last`? The CLI treats this as a usage error and prints help text.
- What if a job in `completed` state is given? Only `failed` jobs are retryable; completed jobs are not eligible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST expose a `cockpit retry <job-id>` subcommand that resets a failed job to a retryable state.
- **FR-002**: `cockpit retry` MUST reset the targeted job's status to `queued` and clear its error field, while leaving the stage unchanged so the pipeline resumes from the stage where the failure occurred rather than restarting from the beginning.
- **FR-003**: `cockpit retry` MUST only operate on jobs in a `failed` state; attempting to retry a job in any other state MUST produce an error with a non-zero exit code.
- **FR-004**: `cockpit retry` MUST exit with a non-zero code and a descriptive error message when the given job ID does not exist.
- **FR-005**: `cockpit retry` MUST print a confirmation message including the job ID upon successful requeue.
- **FR-006**: `cockpit retry --last` MUST requeue the most recently failed job without requiring the operator to supply an ID.
- **FR-007**: `cockpit retry --last` MUST include the retried job ID in its confirmation output.
- **FR-008**: `cockpit retry --last` MUST exit with a non-zero code and a clear message when no failed jobs exist.
- **FR-009**: Supplying both `<job-id>` positional argument and `--last` flag simultaneously MUST produce a usage error with a non-zero exit code.
- **FR-010**: The command MUST NOT require the daemon to be running in order to succeed.
- **FR-011**: Retrying a job MUST reset the automatic retry counter so the job receives a fresh set of automatic retry attempts.

### Key Entities

- **Job**: A unit of work tracking a spec-kit pipeline run. Has an identifier, status (queued/active/failed/completed/cancelled/rate_limited), stage (idle/specify/clarify/plan/tasks/analyze/implement), and an error field. Retrying resets status to `queued` and clears the error field; the stage is preserved so the pipeline resumes from where it failed rather than restarting from scratch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can retry a failed job in under 10 seconds without opening any database tool or writing any SQL.
- **SC-002**: `cockpit retry --last` requires zero knowledge of job IDs — operators need only remember one command to retry the most recent failure.
- **SC-003**: All error paths (unknown ID, wrong state, no failed jobs, conflicting arguments) produce a human-readable error message with a non-zero exit code, enabling reliable scripted use.
- **SC-004**: A retried job is picked up and executed by the daemon on the next poll cycle without requiring a daemon restart.

## Assumptions

- A "failed" job is one with `status = 'failed'` in the jobs table. Jobs in other states (`active`, `queued`, `completed`, `cancelled`, `rate_limited`) are not retryable via this command.
- "Most recently failed" for `--last` is determined by `updated_at DESC` — the timestamp set when the job transitioned to `failed`.
- Retrying resets only `status` (to `queued`) and `error` (to null); the `stage` field is intentionally preserved so the pipeline resumes from the point of failure, not from the beginning.
- Retrying via `cockpit retry` resets the automatic retry counter. This is intentional — an operator explicitly choosing to retry has acknowledged the prior automatic failures.
- If a job's stage is somehow null or unknown at retry time, the pipeline defaults to starting from the first stage (`specify`) as a safe fallback.
- The command does not need to notify or interact with a running daemon; the daemon picks up the re-queued job on its next poll cycle naturally.
