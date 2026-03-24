# Feature Specification: Claude Rate Limit Handling

**Feature Branch**: `005-claude-rate-limits`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "handle rate limits: When I get rate limited by claude the pipeline should handle it gracefully and return a message for stating the issue and the time it will reset, then poll until that time and continue. Note: claude will be out of tokens so this will need to be done programmatically to fetch the time and set the wait/retry period"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pipeline Pauses on Rate Limit and Resumes Automatically (Priority: P1)

A developer has a Cockpit job running in the background. Mid-pipeline, the Claude Code process hits an Anthropic usage/rate limit. Rather than the job failing silently or crashing, Cockpit detects the condition, posts a descriptive comment to the GitHub issue explaining what happened and when the limit resets, then automatically waits and resumes the pipeline at the exact stage that was interrupted — no manual intervention needed.

**Why this priority**: This is the core ask. Without graceful handling, rate limits silently fail the entire job, requiring manual re-triggering. Automatic resume is the primary value.

**Independent Test**: Simulate a rate-limit exit from the Claude process; verify a GitHub comment appears with the reset time and the job eventually continues from the same stage.

**Acceptance Scenarios**:

1. **Given** a job is running a pipeline stage, **When** the Claude process terminates with a rate-limit signal before completing the stage, **Then** Cockpit posts a GitHub issue comment that names the stage, explains the rate limit, and states the reset time in a human-readable format.
2. **Given** a rate-limit comment has been posted, **When** the reset time is reached, **Then** Cockpit automatically retries the interrupted stage without any manual action.
3. **Given** the retried stage completes successfully, **When** no further rate limits occur, **Then** the pipeline continues with the next stage as normal.

---

### User Story 2 - Operator Visibility Into Waiting State (Priority: P2)

An operator running `cockpit status` or reviewing logs while a job is paused for rate-limit recovery can clearly see that the job is in a "rate-limit wait" state, not stalled or failed.

**Why this priority**: Visibility prevents operators from prematurely restarting jobs or assuming failure when the system is healthy and waiting.

**Independent Test**: Trigger a rate-limit pause; run `cockpit status` and inspect logs to confirm the waiting state is clearly reported.

**Acceptance Scenarios**:

1. **Given** a job is paused due to a rate limit, **When** `cockpit status` is run, **Then** the job status is shown as waiting/paused with the reset time displayed.
2. **Given** a job is paused due to a rate limit, **When** logs are tailed, **Then** a log entry records the rate-limit event, stage, and scheduled resume time.

---

### User Story 3 - Multiple Rate Limits Within a Single Job (Priority: P3)

A long-running job (e.g., a large implement stage) encounters more than one rate limit during its lifetime. Each occurrence is handled independently: comment posted, wait observed, resume attempted.

**Why this priority**: Edge case but realistic for large features. The retry mechanism must be idempotent across multiple consecutive rate-limit events.

**Independent Test**: Simulate two sequential rate-limit exits for the same stage; verify two comments are posted and the job eventually completes.

**Acceptance Scenarios**:

1. **Given** a stage is retried after a rate limit and hits a second rate limit, **When** the second limit is detected, **Then** Cockpit posts a second comment with the new reset time and waits again.
2. **Given** repeated rate limits occur, **Then** each retry is independently logged and commented without corrupting job state.

---

### Edge Cases

- What happens if the reset time cannot be parsed from the rate-limit signal? System falls back to a configurable default wait period (e.g., 60 minutes) and notes the fallback in the comment.
- What happens if the job is manually stopped while waiting for a rate-limit reset? The wait is cancelled and the job moves to a failed/stopped state; no resume occurs.
- What if the rate limit recurs immediately after resume (reset time was incorrect)? Cockpit detects the new rate limit, increments the retry counter, and starts another wait cycle using the new reset time from the message.
- What happens when the 3rd retry also hits a rate limit? The job is permanently failed; Cockpit posts a final GitHub comment explaining that the rate-limit retry limit was reached.
- What if the GitHub comment post itself fails during the rate-limit event? Cockpit logs the failure and proceeds with the wait/resume cycle anyway; the pipeline is not blocked by a failed comment.
- What if the daemon restarts while a job is in the rate-limit wait state? On startup the daemon reads persisted wait state from the job store; if the reset time has already passed it resumes immediately, otherwise it resumes the wait from the stored resume-at timestamp.

## Clarifications

### Session 2026-03-24

- Q: How should Cockpit detect the rate limit and obtain the reset timestamp? → A: Parse Claude process stdout/stderr for a rate-limit message that includes the reset timestamp.
- Q: Should there be a maximum number of rate-limit retries before a job is permanently failed? → A: Cap at 3 retries; each retry waits until the exact reset time from the rate-limit message, not an arbitrary interval.
- Q: If the daemon crashes or restarts while a job is waiting for a rate-limit reset, should the job auto-resume? → A: Yes — persist the wait state and resume-at timestamp in the database so the job auto-resumes after daemon restart.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect when a Claude Code process terminates due to an Anthropic usage or rate limit by scanning the process stdout/stderr output for a rate-limit message, distinguishing it from other failure modes.
- **FR-002**: The system MUST extract the reset timestamp from the rate-limit message found in Claude's stdout/stderr output, without relying on Claude to interpret or report it in any other way.
- **FR-003**: The system MUST post a GitHub issue comment when a rate limit is detected, including: the current pipeline stage, a plain-language description of the rate limit, and the reset time formatted in a human-readable way (e.g., "resets at 14:32 UTC, in approximately 47 minutes").
- **FR-004**: The system MUST pause the current job and wait until the reset time before retrying the interrupted stage.
- **FR-005**: The system MUST resume the pipeline from the stage that was interrupted, not from the beginning of the job.
- **FR-006**: The system MUST record the rate-limit event, reset time, and scheduled resume time in the job log.
- **FR-007**: The system MUST expose the waiting/paused state in `cockpit status` output while a job is waiting for a rate-limit reset.
- **FR-008**: If the reset time cannot be determined, the system MUST fall back to a default wait period and note the fallback in both the log and the GitHub comment.
- **FR-009**: The system MUST handle up to 3 consecutive rate-limit events per job, treating each independently; after the 3rd rate limit the job MUST be permanently failed with a clear error message.
- **FR-010**: Rate-limit wait and resume logic MUST be implemented entirely in the Cockpit daemon, with no dependence on Claude to detect or report its own rate limit.
- **FR-011**: Each retry MUST wait until the exact reset time extracted from the rate-limit message — not a fixed or arbitrary backoff interval.
- **FR-012**: The rate-limit wait state (status, resume-at timestamp, retry count) MUST be persisted in the job store so that a daemon crash or restart during a wait period does not lose the job — the job MUST automatically resume when the daemon restarts and the reset time has passed.

### Key Entities

- **Rate Limit Event**: A detected condition where Claude cannot proceed due to usage exhaustion; has a reset timestamp, affected stage, and job reference.
- **Job Wait State**: A durable job status indicating the job is paused pending a rate-limit reset; persisted in the job store with the resume-at timestamp and retry count so it survives daemon restarts.
- **Rate Limit Comment**: A GitHub issue comment posted when a rate limit is detected; documents the stage, cause, and reset time for the human operator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of rate-limit events result in a GitHub issue comment posted within 30 seconds of detection.
- **SC-002**: Jobs automatically resume within 60 seconds of the rate-limit reset time passing, without manual intervention.
- **SC-003**: Jobs that hit 3 or fewer rate limits complete successfully; jobs that exceed 3 rate-limit events are failed with a descriptive error and a GitHub comment explaining the terminal state.
- **SC-004**: The waiting state is visible in `cockpit status` within 5 seconds of the rate-limit being detected.
- **SC-005**: When the reset time cannot be parsed, the fallback wait period is applied in 100% of cases and the fallback is documented in the GitHub comment.

## Assumptions

- The Anthropic rate-limit signal is detectable from the Claude Code process stdout/stderr output; Cockpit's existing node-pty line buffer captures this output and is the source for detection and timestamp extraction.
- The reset timestamp is present in a machine-readable form within Claude's stdout/stderr rate-limit message (e.g., an ISO 8601 timestamp or Unix epoch embedded in the text).
- The default fallback wait period (when reset time is unparseable) is 60 minutes. Making this user-configurable via `config.json` is deferred to a future iteration; the constant lives in source code for now.
- A job can be retried at the same stage without corrupting earlier stage artifacts (stages are idempotent from Cockpit's perspective).
- The GitHub comment posting service (`commenter.js`) is already in place; this feature adds a new comment type, not a new posting mechanism.
