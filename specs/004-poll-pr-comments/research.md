# Research: Poll PR Comments & Implement Changes

**Feature**: 004-poll-pr-comments
**Date**: 2026-03-24

## Findings

### 1. Existing Schema Coverage

**Decision**: No new DB tables needed.

**Rationale**: The main branch already contains `active_prs`, `seen_pr_comments`, and `pr_review_jobs` tables in `src/db/index.js`, along with full CRUD modules (`src/db/prs.js`, `src/db/pr-reviews.js`). The schema is already lean and covers all fields required by FR-010 (PR number, job ID, acknowledged comment IDs via `seen_pr_comments`).

**Alternatives considered**: Adding a dedicated `pr_poll_state` table was rejected — the existing three tables already separate concerns cleanly.

**Gap**: `src/db/pr-reviews.js` only has `enqueuePrReview` and `dequeuePrReview`. It needs `markPrReviewComplete`, `markPrReviewFailed`, and `resetPrReviewToQueued` (reset status to 'queued' for retry).

---

### 2. Bot Identity & Anti-Loop Filter

**Decision**: Filter PR comments by two criteria: (1) `comment.user.login === githubOwner`, (2) comment body does not start with a known bot emoji prefix.

**Rationale**: Since Cockpit uses the `githubOwner` token to post comments, bot comments and human comments share the same author login. The emoji-prefix check (`👀`, `✅`, `❌`, `⚠️`, `🎉`, `🚀`, `💬`) mirrors the existing `isHumanComment` function in `stage-executor.js` — a proven, zero-config approach. Adding `👀` covers the new acknowledgement emoji.

**Alternatives considered**: Using a separate "bot GitHub account" was rejected (requires extra setup); storing posted comment IDs in DB was rejected (over-engineering — emoji prefix is sufficient and already established).

---

### 3. PR State Check & Deregistration

**Decision**: Call `octokit.pulls.get` once per active PR per poll cycle to check for merged/closed state.

**Rationale**: GitHub's issues comment endpoint does not surface PR state. The `pulls.get` call is lightweight and benefits from the existing ETag cache in `src/github/client.js` (304 responses on repeat calls). If `pr.state === 'closed'`, call `deregisterPr` and skip further polling.

**Alternatives considered**: Detecting closure via comment-fetch errors (404) was rejected as unreliable — the PR conversation may still be fetchable after close.

---

### 4. Claude Invocation Strategy for PR Reviews

**Decision**: Start a new Claude session per PR review batch (use `-p`, not `--continue`).

**Rationale**: PR review comments are independent tasks from the original spec-kit pipeline session. The spec-kit session may have ended long ago or the Claude session ID may no longer be valid. A fresh `-p` invocation in the PR's `repo_path` gives Claude full access to the current codebase state without relying on session continuity.

**Alternatives considered**: Using `--continue` on the original spec-kit session was rejected — sessions don't survive daemon restarts and the review may happen days after the original pipeline.

---

### 5. Acknowledgement Strategy

**Decision**: Post a single `👀` PR comment acknowledging all unaddressed comments in a batch, before invoking Claude.

**Rationale**: Batching acknowledgements into one comment (listing the comments being addressed) reduces GitHub API calls and produces a cleaner PR conversation. Individual per-comment replies are not possible for top-level PR conversation comments (only for inline review comments on diff lines).

**Alternatives considered**: One acknowledgement per comment was rejected — noisy and wastes API quota. No acknowledgement was rejected — violates FR-003.

---

### 6. Retry Strategy (Lean DB Constraint)

**Decision**: On failure, reset `pr_review_jobs.status` to `'queued'`; no retry count column.

**Rationale**: Adding a `retry_count` column conflicts with the lean DB constraint. The failure comment on the PR notifies the user; if retries keep failing, the user can intervene. Rate-limit failures are handled transparently by the existing `RateLimitError` / `sleep` mechanism in `poller.js`.

**Alternatives considered**: Retry count column was considered but rejected per user direction to keep DB lean. Exponential backoff was rejected — the poll interval already provides a natural backoff floor.

---

### 7. Git Operations in PR Review

**Decision**: Use `execFile('/bin/sh', ['-c', 'git add -A && git commit -m "..." && git push'])` in `repo_path` — same pattern as `postImplementCommand` in `stage-executor.js`.

**Rationale**: Claude's output includes code changes but does not include a `git push` guarantee. The executor must explicitly commit and push after Claude succeeds. Using `execFile` with a shell string mirrors the existing hook execution pattern and avoids a new dependency (e.g., `simple-git`).

**Alternatives considered**: Relying on Claude to run `git push` itself was rejected — Claude may or may not push depending on its output; the executor needs deterministic push behavior.
