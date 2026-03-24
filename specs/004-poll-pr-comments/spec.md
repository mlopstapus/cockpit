# Feature Specification: Poll PR Comments & Implement Changes

**Feature Branch**: `004-poll-pr-comments`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "poll mr comments: When an MR is created via cockpit, Cockpit should monitor the MR comments and implement changes according to the comments. It should provided confirmation the comment was received and iterate, then push and poll for more comments that are unaddressed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reviewer Comments Trigger Code Changes (Priority: P1)

A developer opens a Cockpit-created PR on GitHub and leaves review comments requesting code changes. Cockpit detects the new comments, acknowledges them by replying to each comment, implements the requested changes, pushes the updated branch, and then waits for further review comments.

**Why this priority**: This is the core loop that makes the feature valuable — closing the gap between a human reviewer and an autonomous implementation agent without requiring the user to re-trigger anything manually.

**Independent Test**: Can be fully tested by creating a PR via Cockpit, posting a review comment requesting a change, and verifying that (1) an acknowledgement reply appears on the comment, (2) the code change is committed and pushed, and (3) Cockpit continues polling for more comments.

**Acceptance Scenarios**:

1. **Given** a PR created by Cockpit is open, **When** a reviewer posts a top-level PR comment requesting a change, **Then** Cockpit posts a reply acknowledging receipt of the comment within one poll cycle.
2. **Given** Cockpit has acknowledged a review comment, **When** the implementation is complete, **Then** Cockpit commits and pushes the updated branch to the same PR branch.
3. **Given** a change has been pushed, **When** Cockpit polls again, **Then** any new comments posted after the previous push are detected and processed.

---

### User Story 2 - Multiple Unaddressed Comments Batched Together (Priority: P2)

A reviewer posts several comments on the same PR before Cockpit processes any of them. Cockpit identifies all unaddressed comments, acknowledges each one, implements all requested changes in a single pass, and pushes once.

**Why this priority**: Batching avoids noisy commit history and respects reviewers who leave multiple comments at once before waiting for a response.

**Independent Test**: Can be tested by posting three review comments in quick succession before Cockpit's next poll cycle and verifying a single acknowledgement burst followed by a single push containing all changes.

**Acceptance Scenarios**:

1. **Given** three unacknowledged comments exist on an open PR, **When** Cockpit polls, **Then** all three comments are acknowledged in a single batch reply (e.g., "Received 3 comment(s) — implementing now…") before implementation begins.
2. **Given** all pending comments have been acknowledged, **When** implementation is complete, **Then** a single commit/push covers all requested changes.

---

### User Story 3 - No New Comments — Cockpit Stays Idle (Priority: P3)

After Cockpit pushes changes, the reviewer has not yet responded. Cockpit continues polling at the configured interval and does nothing until a new unaddressed comment appears.

**Why this priority**: Prevents redundant processing and makes it clear to observers that Cockpit is waiting for human input.

**Independent Test**: Can be tested by verifying no additional commits are pushed and no duplicate acknowledgements appear during a polling window with no new comments.

**Acceptance Scenarios**:

1. **Given** all existing comments have been acknowledged and implemented, **When** Cockpit polls, **Then** no new commits are pushed and no new bot comments are posted.
2. **Given** a reviewer posts a new comment after a quiet period, **When** Cockpit detects it, **Then** the comment is processed normally (acknowledge → implement → push).

---

### Edge Cases

- What happens when a comment requests a change that conflicts with the original implementation or a previous comment's change? (Out of scope — Claude resolves conflicts organically using its full view of the codebase; if the result is unsatisfactory, the reviewer can post a follow-up comment.)
- How does the system handle a PR that has been merged or closed while Cockpit is mid-implementation?
- What if Cockpit's push is rejected by the remote (e.g., branch protection rules)?
- How does the system distinguish between a human reviewer's comment and Cockpit's own acknowledgement comments to avoid infinite loops?
- What if the implementation fails (Claude errors out) after acknowledgement has already been posted? → Cockpit posts a failure comment and retries on the next poll cycle; rate-limit failures wait for the limit to clear before retrying.
- What happens if the PR branch diverges from base (e.g., new commits from another source) during the poll loop? (Out of scope — git push will succeed as long as there are no conflicts; if the push is rejected due to divergence, FR-012 failure handling applies and the reviewer can rebase and re-comment.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a Cockpit-created PR is opened, the system MUST begin polling that PR's comments at the configured poll interval.
- **FR-002**: The system MUST identify comments that have not yet been acknowledged by Cockpit (unaddressed comments).
- **FR-002a**: The system MUST only treat comments authored by the configured `githubOwner` as actionable implementation requests; comments from all other authors MUST be ignored.
- **FR-003**: For each unaddressed comment, the system MUST post a reply on that comment thread confirming receipt before starting implementation.
- **FR-004**: The system MUST pass all unaddressed comments to Claude as implementation instructions and execute the resulting code changes.
- **FR-005**: After implementation is complete, the system MUST commit and push the changes to the existing PR branch.
- **FR-006**: The system MUST NOT re-process comments that have already been acknowledged in a previous cycle.
- **FR-007**: The system MUST continue polling the PR for new comments after each push, until the PR is merged or closed.
- **FR-008**: When the PR is merged or closed, the system MUST deregister the PR from active monitoring and stop all further polling of that PR.
- **FR-009**: The system MUST handle the case where no unaddressed comments exist by taking no action and waiting for the next poll cycle.
- **FR-010**: The system MUST persist active PR poll state (at minimum: PR number, associated job ID, and set of acknowledged comment IDs) in the existing SQLite database so that polling resumes automatically after a daemon restart, without introducing unnecessary new tables or columns.
- **FR-011**: The system MUST NOT acknowledge or process its own bot-posted comments to prevent infinite feedback loops.
- **FR-012**: When implementation fails after acknowledgement, the system MUST post a failure notice comment on the PR and schedule a retry on the next poll cycle.
- **FR-013**: When a failure is caused by a GitHub API rate limit, the system MUST delay the retry until the rate limit window has elapsed, rather than retrying immediately.

### Key Entities

- **PR Comment**: A comment posted on a Cockpit-created PR; has a unique identifier, body text, author, and an addressed/unaddressed state as tracked by Cockpit.
- **Acknowledgement**: A reply comment posted by Cockpit on a PR comment thread to confirm receipt; serves as the "addressed" marker for that comment.
- **PR Poll Job**: A long-running job state that monitors a specific PR for new comments after the implement stage completes; tied to the original Cockpit issue job. Persisted with minimal footprint: PR number, job ID, and acknowledged comment IDs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A review comment posted on a Cockpit PR receives an acknowledgement reply within two poll cycles (≤ 2 × `pollIntervalSeconds`). *(Validated manually via quickstart.md; not covered by unit tests.)*
- **SC-002**: 100% of unaddressed comments present at poll time are acknowledged and processed in the same cycle — none are silently skipped.
- **SC-003**: Cockpit posts zero duplicate acknowledgements for the same comment across multiple poll cycles.
- **SC-004**: After an implementation failure, the PR and job state remain consistent — no orphaned acknowledgements exist without corresponding code changes in a follow-up cycle.
- **SC-005**: The system correctly stops monitoring a PR within one poll cycle of the PR being merged or closed.

## Clarifications

### Session 2026-03-24

- Q: When Claude fails mid-implementation after comments have been acknowledged, what should Cockpit do? → A: Post a failure comment on the PR and automatically retry on the next poll cycle. For rate-limit failures specifically, delay retry until the rate limit clears rather than retrying immediately.
- Q: Should Cockpit act on comments from any GitHub user, or only trusted authors? → A: Only process comments from the configured `githubOwner` account, consistent with how issues are filtered.
- Q: After a daemon restart, how should Cockpit recover active PR poll jobs? → A: Persist active PR poll state in SQLite and auto-resume on startup; keep DB additions minimal (lean schema).

## Assumptions

- "PR comments" refers to top-level PR conversation comments, not inline code review comments on specific diff lines. Inline diff comments may be added in a later iteration.
- "Unaddressed" is defined as: a comment that does not have a reply from the Cockpit bot account in its thread.
- The Cockpit bot's own acknowledgement reply is the canonical marker for "addressed" — this may be supplemented by a local record for performance.
- Only PRs created by Cockpit (tracked in the job record) are monitored; externally-created PRs are out of scope.
- The polling interval for PR comments reuses the existing `pollIntervalSeconds` config value; no separate interval is introduced.
- All unaddressed comments found in a single poll cycle are batched into a single implementation pass and a single push.
- A single push per poll cycle is preferred over per-comment pushes to keep commit history clean.
