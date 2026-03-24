# Implementation Plan: Poll PR Comments & Implement Changes

**Branch**: `004-poll-pr-comments` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-poll-pr-comments/spec.md`

## Summary

After Cockpit opens a PR, continue monitoring that PR for top-level conversation comments authored by `githubOwner`. When new comments are found, acknowledge them with a PR comment, run Claude to implement the requested changes, and push the updated branch. Loop until the PR is merged or closed. All state (active PRs, seen comments, review jobs) is already persisted in the existing SQLite schema — the main work is wiring three new modules into the poll loop.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `better-sqlite3`, `@octokit/rest`, `commander@12`, `node:child_process` (execFile, spawn)
**Storage**: SQLite WAL via `better-sqlite3` (`~/.cockpit/cockpit.db`) — schema already has all needed tables
**Testing**: `node:test` (built-in), `npm test` runs `node --test test/**/*.test.js`
**Target Platform**: macOS / Linux, host OS (no containers)
**Project Type**: background daemon / CLI
**Performance Goals**: Acknowledgement posted ≤ 2 × `pollIntervalSeconds` after comment
**Constraints**: Single job at a time; no new npm dependencies; DB additions minimal (schema already complete)
**Scale/Scope**: One daemon, one PR poll loop per active PR per poll cycle

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | All actions scoped to feature branch; githubOwner filter enforced on PR comments; no shared session state between jobs | ✅ |
| II. Thorough Change Review | Delivered as PR; session logs retained in `job_logs` and `pr_review_jobs` tables | ✅ |
| III. Security First | PR comment bodies treated as untrusted input — passed to Claude as text only, no shell interpolation; author filter prevents arbitrary GitHub users from triggering code execution | ✅ |
| IV. Test-Driven Implementation | Unit tests planned for `pr-watcher.js`, `pr-review-executor.js`; integration test extends existing `pipeline.test.js` | ✅ |
| V. Dev Box Execution Model | Host OS execution; Claude spawned via `node:child_process`; no containers | ✅ |
| VI. Continuous Self-Improvement | Memory, backlog, and template updates planned for `/ralph` at session close | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/004-poll-pr-comments/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── github/
│   ├── pr-watcher.js        # NEW — poll active PRs for new comments
│   ├── watcher.js           # existing — poll repos for issues (unchanged)
│   └── commenter.js         # existing — post/list comments (unchanged)
├── daemon/
│   ├── pr-review-executor.js # NEW — execute one PR review job
│   ├── poller.js             # MODIFY — integrate PR watcher + PR review job execution
│   └── stage-executor.js    # existing — unchanged
├── db/
│   ├── pr-reviews.js        # EXTEND — add markPrReviewComplete, markPrReviewFailed, resetToQueued
│   └── prs.js               # existing — registerActivePr, deregisterPr, etc. (unchanged)
└── process/
    └── claude-process.js    # existing — unchanged

test/unit/
├── pr-watcher.test.js       # NEW
└── pr-review-executor.test.js # NEW
```

**Structure Decision**: Single project, Option 1. Only the modules above need changes; no new top-level directories.

## Architecture

### Existing Foundation (no changes needed)

The main branch already provides everything the data layer needs:

| Component | Location | What it provides |
|-----------|----------|-----------------|
| Schema | `src/db/index.js` | `active_prs`, `seen_pr_comments`, `pr_review_jobs` tables |
| PR CRUD | `src/db/prs.js` | `registerActivePr`, `deregisterPr`, `isPrCommentSeen`, `markPrCommentSeen`, `listActivePrs` |
| PR review queue | `src/db/pr-reviews.js` | `enqueuePrReview`, `dequeuePrReview` |
| PR comment API | `src/github/commenter.js` | `listPRComments`, `postPRComment` |
| PR registration | `src/daemon/stage-executor.js` | Calls `registerActivePr` when PR URL detected in Claude output |

### New Poll Loop (after this feature)

```
Each poll cycle (every pollIntervalSeconds):
  1. Hot-reload config
  2. For each repo: pollRepo() → enqueue issue jobs  [existing]
  3. For each active_pr: pollActivePr() → enqueue pr_review_jobs  [NEW]
  4. Run next issue job (if any)  [existing]
  5. Run next PR review job (if any)  [NEW]
  6. Sleep
```

### PR Review Execution Flow

```
executePrReview(db, review, octokit, config):
  1. Post acknowledgement comment on PR:
     "👀 Received N comment(s) — implementing now…"
  2. Build prompt: concatenate all comment bodies with context header
  3. Run Claude (new session, --dangerously-skip-permissions -p <prompt>)
     in review.repo_path
  4. On success:
     - git add -A && git commit && git push  (via execFile)
     - Post: "✅ Changes pushed to branch"
     - markPrReviewComplete(db, review.id)
  5. On failure (Claude error or push error):
     - Post: "❌ Implementation failed: <reason>. Will retry next cycle."
     - resetPrReviewToQueued(db, review.id)
  6. On rate-limit error:
     - No comment (rate limit is transient)
     - resetPrReviewToQueued(db, review.id)
     - Re-throw RateLimitError so poller can sleep
```

### Comment Author & Bot-Loop Filtering

Two filters applied in order in `pr-watcher.js`:

1. **Security filter** — `comment.user.login === githubOwner` (only process comments from the configured owner account)
2. **Anti-loop filter** — comment body does not start with bot emoji prefixes (`👀`, `✅`, `❌`, `⚠️`, `🎉`, `🚀`, `💬`) — reuses the same pattern as `isHumanComment` in `stage-executor.js`, extended with `👀`

Since Cockpit posts using the same GitHub account as `githubOwner`, both filters are necessary to prevent Cockpit from triggering on its own acknowledgement comments.

### PR Lifecycle & Deregistration

During `pollActivePr`, after fetching comments, check PR state:
- Call `octokit.pulls.get` to fetch PR state
- If `state === 'closed'` (covers both merged and closed): call `deregisterPr` and stop polling

On daemon restart: `listActivePrs()` returns all rows from `active_prs` — these are re-attached to the poll loop automatically (FR-010 satisfied without schema changes).

### Failure & Retry Strategy

| Failure type | Action |
|-------------|--------|
| Claude exits non-zero | Post failure comment on PR; reset `pr_review_jobs.status = 'queued'` |
| git push rejected | Post failure comment on PR; reset to 'queued' |
| GitHub API rate limit | Reset to 'queued'; re-throw `RateLimitError`; poller sleeps until limit clears |
| PR closed during execution | Acknowledge, then deregister; no retry needed |

No retry count column is added (lean DB constraint). Failure comment notifies user; if retries keep failing, user intervenes by re-commenting or checking logs.

## Design Decisions

All from `research.md`:

1. **No new DB tables** — existing `active_prs`, `seen_pr_comments`, `pr_review_jobs` cover all needs; only extend `pr-reviews.js` with 2 new methods
2. **Single acknowledgement per batch** — one `👀` comment for all unaddressed comments in a cycle, not one per comment (cleaner UX, fewer API calls)
3. **New Claude session per PR review** — use `-p` (not `--continue`) since review comments are independent of the spec-kit session
4. **Bot identity via emoji prefix** — same pattern as `isHumanComment` in stage-executor; no new config needed
5. **PR state check via `pulls.get`** — called each poll cycle; ETag cache keeps API cost low
6. **No separate poll interval** — reuses `pollIntervalSeconds` (no config schema change)
