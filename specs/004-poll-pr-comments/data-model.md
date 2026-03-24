# Data Model: Poll PR Comments & Implement Changes

**Feature**: 004-poll-pr-comments
**Date**: 2026-03-24

## Overview

All required tables exist in the main branch schema (`src/db/index.js`). No new tables are introduced. This document describes how each existing table is used by this feature.

---

## Tables Used

### `active_prs` (existing, no changes)

Tracks PRs that Cockpit has opened and must monitor.

| Column | Type | Description |
|--------|------|-------------|
| `github_repo` | TEXT | `owner/repo` format |
| `pr_number` | INTEGER | GitHub PR number |
| `job_id` | TEXT | FK → `jobs.id` — the original issue job that opened this PR |
| `issue_number` | INTEGER | Original issue number |
| `repo_path` | TEXT | Local clone path |
| `registered_at` | TEXT (ISO8601) | When the PR was detected |

**Populated by**: `registerActivePr()` in `stage-executor.js` when a PR URL is detected in Claude output.
**Read by**: `listActivePrs()` in `pr-watcher.js` to discover which PRs to poll.
**Deleted by**: `deregisterPr()` in `pr-watcher.js` when PR is merged or closed.

**Restart recovery**: On daemon restart, `listActivePrs()` returns all rows — active PR monitoring resumes automatically (satisfies FR-010).

---

### `seen_pr_comments` (existing, no changes)

Tracks which PR comment IDs have already been enqueued for processing (prevents duplicate processing).

| Column | Type | Description |
|--------|------|-------------|
| `github_repo` | TEXT | `owner/repo` format |
| `pr_number` | INTEGER | PR number |
| `comment_id` | TEXT | GitHub comment ID (stored as TEXT; GitHub uses integers but TEXT is safe) |
| UNIQUE | | `(github_repo, pr_number, comment_id)` |

**Populated by**: `markPrCommentSeen()` in `pr-watcher.js` before enqueueing.
**Read by**: `isPrCommentSeen()` in `pr-watcher.js` to filter already-processed comments.

**Note**: This table persists the "acknowledged" state implied by the Cockpit bot's reply comment. Even if the bot comment is somehow missing, Cockpit will not re-enqueue a seen comment ID.

---

### `pr_review_jobs` (existing, extend CRUD only)

Queue of pending PR review tasks, one row per comment batch per poll cycle.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | Random hex job ID |
| `github_repo` | TEXT | `owner/repo` format |
| `pr_number` | INTEGER | PR number |
| `issue_number` | INTEGER | Original issue number |
| `repo_path` | TEXT | Local clone path |
| `comment_id` | TEXT | ID of the triggering comment (first in batch) |
| `comment_body` | TEXT | Full body of the triggering comment(s), newline-separated |
| `pr_url` | TEXT | Full GitHub PR URL (for posting result comments) |
| `status` | TEXT | `queued` → `active` → `completed` \| `failed` (reset to `queued` on retry) |
| `created_at` | TEXT (ISO8601) | Enqueue timestamp |

**Lifecycle**:
```
queued → [dequeuePrReview] → active
active → [markPrReviewComplete] → completed
active → [markPrReviewFailed / resetPrReviewToQueued] → queued  (retry)
```

**CRUD extensions needed** in `src/db/pr-reviews.js`:

```js
markPrReviewComplete(db, id)         // UPDATE status='completed' WHERE id=?
markPrReviewFailed(db, id, error)    // log error; call resetPrReviewToQueued (retry)
resetPrReviewToQueued(db, id)        // UPDATE status='queued' WHERE id=?
```

---

## Entity Relationships

```
jobs (issue jobs)
  │  id ──────────────────────────────────────────────────┐
  └─ registers via registerActivePr()                     │
        ↓                                                  │
  active_prs                                               │
    github_repo, pr_number (PK)  ←── polled each cycle   │
    job_id ────────────────────────────────────────────────┘
        ↓ pr-watcher detects new comments
  seen_pr_comments   (dedup guard)
        ↓ new comment → enqueue
  pr_review_jobs
    status: queued → active → completed|queued(retry)
        ↓ pr-review-executor dequeues
  [Claude runs] → git push → PR comment posted
```

---

## State Transitions

### Active PR lifecycle

```
PR opened (registerActivePr)
  → polling loop (listActivePrs + pollActivePr each cycle)
  → PR merged/closed (deregisterPr) → removed from active_prs
```

### PR review job lifecycle

```
New owner comment detected
  → markPrCommentSeen (prevent re-enqueue)
  → enqueuePrReview (status=queued)
  → dequeuePrReview (status=active)
  → Claude runs
  → success: markPrReviewComplete (status=completed)
  → failure: resetPrReviewToQueued (status=queued, retry next cycle)
```
