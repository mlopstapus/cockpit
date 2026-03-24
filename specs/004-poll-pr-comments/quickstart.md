# Quickstart: Poll PR Comments & Implement Changes

**Feature**: 004-poll-pr-comments
**Date**: 2026-03-24

## Prerequisites

- Cockpit daemon configured and running (`cockpit status`)
- A repo configured in `~/.cockpit/config.json` with `localPath`
- `githubOwner` set to your GitHub username

## How It Works After This Feature

1. Open a `[COCKPIT]` issue → Cockpit runs the spec-kit pipeline → Claude opens a PR
2. Post a comment on the PR (from the `githubOwner` account) requesting a change
3. Within `pollIntervalSeconds` × 2, Cockpit posts `👀 Received N comment(s) — implementing now…`
4. Claude implements the change, commits, and pushes to the PR branch
5. Cockpit posts `✅ Changes pushed to branch`
6. Repeat from step 2 as needed; Cockpit stops when the PR is merged or closed

## Testing the Feature Manually

```bash
# 1. Start the daemon
cockpit start

# 2. Open a [COCKPIT] issue in a watched repo — wait for the PR to be created

# 3. Post a comment on the PR (as githubOwner)
#    e.g. "Please add a README section describing the new feature"

# 4. Watch the daemon logs
cockpit logs   # tail live

# 5. Expected sequence in logs:
#    [cockpit] PR comment poll: found 1 new comment(s) on PR #42
#    [cockpit] PR review job enqueued: <job-id>
#    [cockpit] PR review job starting: <job-id>
#    [cockpit] Acknowledgement posted on PR #42
#    [cockpit] Claude exited 0
#    [cockpit] Changes pushed to branch
#    [cockpit] PR review job completed: <job-id>
```

## Running the Test Suite

```bash
npm test
# Covers: pr-watcher.test.js, pr-review-executor.test.js, pipeline.test.js
```

## Failure Scenarios

| Scenario | What you see on GitHub | What to do |
|----------|----------------------|------------|
| Claude errors out | `❌ Implementation failed: … Will retry next cycle.` | Wait for next poll cycle; comment again if it keeps failing |
| Rate limit hit | No comment; Cockpit sleeps until limit clears | Nothing — auto-recovers |
| Push rejected | `❌ Implementation failed: git push rejected` | Check branch protection settings |
| PR closed before processing | No comment; Cockpit stops polling that PR | Expected behaviour |
