# Implementation Plan: Cockpit Node.js Rewrite

**Branch**: `002-nodejs-rewrite` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-nodejs-rewrite/spec.md`

## Summary

Replace the Python/FastAPI + Redis backend with a single Node.js ESM package. The package exposes a `cockpit` CLI binary: `cockpit init` runs a TUI setup wizard (systemd/launchd service install), `cockpit daemon` is the long-running polling loop (spawned by the service manager), and `cockpit <status|logs|repos|token|stop|restart|start>` provides runtime management. State is persisted in `~/.cockpit/cockpit.db` (SQLite via `better-sqlite3`); Claude Code processes are spawned with `node-pty`; GitHub polling uses `@octokit/rest` with ETag caching.

## Technical Context

**Language/Version**: Node.js 18+ (ESM modules)
**Primary Dependencies**:
- `commander@^12` — CLI parsing (already in setup/)
- `@clack/prompts@^0.7` — TUI wizard (already in setup/)
- `chalk@^5` — terminal colour (already in setup/)
- `better-sqlite3@^11` — embedded SQLite, WAL mode
- `node-pty@^1.1` — PTY spawning for Claude Code
- `@octokit/rest@^21` — GitHub API with ETag caching
- `node-gyp` (dev, for building native modules)

**Storage**: SQLite (`~/.cockpit/cockpit.db`, WAL mode) + JSON config (`~/.cockpit/config.json`, chmod 600)
**Testing**: `node:test` (built-in) + `node:assert`
**Target Platform**: Linux (systemd) and macOS (launchd), Node.js 18+
**Project Type**: CLI tool + background daemon
**Performance Goals**: Poll cycle ≤30s, CLI commands ≤2s response, issue acknowledgement within 60s
**Constraints**: Zero external service dependencies (no Redis, no Docker, no Python)
**Scale/Scope**: Single user, small number of repos (1–20), one job at a time

## Constitution Check

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | Will all agent actions be scoped to a feature branch and logged? | ✅ Yes — daemon writes all PTY output to job_logs; jobs are branch-scoped |
| II. Thorough Change Review | Will this feature be delivered as a PR with session logs available for review? | ✅ Yes — standard PR workflow, no direct main push |
| III. Security First | Have all external inputs been identified and sanitised? Are secrets handled securely? | ✅ Yes — GitHub token stored chmod 600, never logged; issue content sanitised before passing to Claude |
| IV. Test-Driven Implementation | Are tests planned alongside implementation for all critical paths? | ✅ Yes — test tasks included for all modules in tasks.md |

## Project Structure

### Documentation (this feature)

```
specs/002-nodejs-rewrite/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── cli-commands.md  ← Phase 1 output
└── tasks.md             ← Phase 2 output (next: /speckit.tasks)
```

### Source Code (repository root — replaces backend/)

```
src/
├── cli/
│   ├── index.js          ← `cockpit` binary entry point (commander root)
│   ├── init.js           ← `cockpit init` wizard (absorbs setup/)
│   ├── daemon-control.js ← start/stop/restart/status (systemctl/launchctl wrappers)
│   ├── logs.js           ← `cockpit logs [job-id]`
│   ├── repos.js          ← `cockpit repos list/add/remove`
│   └── token.js          ← `cockpit token`
├── daemon/
│   ├── index.js          ← daemon entry point (writes PID, starts poll loop)
│   ├── poller.js         ← GitHub issue poll loop
│   ├── job-runner.js     ← dequeue + run one job at a time
│   └── stage-executor.js ← per-stage Claude invocation + sentinel detection
├── db/
│   ├── index.js          ← Database init (WAL, schema creation)
│   ├── jobs.js           ← job CRUD + status transitions
│   ├── logs.js           ← append_log, get_log_tail (1000-line buffer)
│   ├── comments.js       ← seen_comments dedup
│   ├── prs.js            ← active_prs + seen_pr_comments
│   └── pr-reviews.js     ← pr_review_jobs queue
├── github/
│   ├── client.js         ← octokit instance factory + ETag cache
│   ├── watcher.js        ← issue polling + [COCKPIT] filtering
│   └── commenter.js      ← post/read issue comments
├── process/
│   └── claude-process.js ← node-pty spawn, stdin inject, exit handling
├── config/
│   └── index.js          ← read/write ~/.cockpit/config.json (chmod 600)
└── templates/
    ├── cockpit-daemon.service.template
    └── com.cockpit.daemon.plist.template

test/
├── unit/
│   ├── db.test.js
│   ├── config.test.js
│   ├── watcher.test.js
│   └── stage-executor.test.js
└── integration/
    └── pipeline.test.js

package.json     ← "type": "module", bin: { cockpit: "src/cli/index.js" }
```

**Structure Decision**: Single ESM package at repo root. The `setup/` directory is absorbed into `src/cli/init.js`. The `backend/` Python directory is deleted. `package.json` at repo root becomes the project's `package.json`.

## Phases

### Phase 1: Foundation (Database + Config)

**Goal**: Get `~/.cockpit/cockpit.db` and `~/.cockpit/config.json` working with full test coverage. No daemon, no GitHub, no PTY yet.

Deliverables:
- `src/db/index.js` — schema init, WAL mode, all 6 tables
- `src/db/jobs.js` — enqueue, dequeue (FIFO + dedup), mark_active, mark_complete, mark_failed, mark_cancelled, get, list_active, list_recent
- `src/db/logs.js` — append_log (1000-line trim), get_log_tail
- `src/db/comments.js` — is_comment_seen, mark_comment_seen
- `src/db/prs.js` — register_active_pr, list_active_prs, get_active_pr, deregister_pr, is_pr_comment_seen, mark_pr_comment_seen
- `src/db/pr-reviews.js` — enqueue_pr_review, dequeue_pr_review
- `src/config/index.js` — readConfig, writeConfig (chmod 600), validateConfig
- Tests for all of the above using `:memory:` SQLite

### Phase 2: GitHub Integration

**Goal**: Poll GitHub for `[COCKPIT]` issues and post comments. No Claude yet.

Deliverables:
- `src/github/client.js` — Octokit factory with ETag in-memory cache
- `src/github/watcher.js` — poll all repos, filter by owner + prefix, enqueue jobs
- `src/github/commenter.js` — post_comment, list_comments_since, PR comment support
- Tests with Octokit mocked

### Phase 3: Claude Process

**Goal**: Spawn Claude with node-pty, capture output, inject stdin.

Deliverables:
- `src/process/claude-process.js` — spawn, onData line buffer, write (stdin inject), kill, onExit, timeout
- Stage sentinel detection (output pattern matching)
- Rate limit signal detection in output stream
- Tests with mocked pty process

### Phase 4: Daemon Loop

**Goal**: Full end-to-end pipeline: poll → dequeue → run → comment.

Deliverables:
- `src/daemon/index.js` — PID file, SIGTERM handler, startup validation
- `src/daemon/poller.js` — poll loop with configurable interval, config reload on each cycle
- `src/daemon/job-runner.js` — FIFO dequeue, single-job-at-a-time runner
- `src/daemon/stage-executor.js` — per-stage Claude invocation, stage comments, clarify relay, post-implement hook
- Integration test: mock GitHub + mock PTY, verify full job lifecycle

### Phase 5: CLI

**Goal**: All `cockpit` subcommands working.

Deliverables:
- `src/cli/index.js` — commander root with all subcommands registered
- `src/cli/init.js` — TUI wizard (absorbs `setup/` logic + adds service install)
- `src/cli/daemon-control.js` — start/stop/restart/status wrapping systemctl/launchctl
- `src/cli/logs.js` — tail daemon logs and job-specific logs
- `src/cli/repos.js` — list/add/remove
- `src/cli/token.js` — interactive token update
- Service file templates (systemd + launchd)
- Tests for init wizard (--yes mode), repos add/remove, config validation

### Phase 6: Migration + Cleanup

**Goal**: Remove all Python/Redis artifacts; update documentation.

Deliverables:
- Delete `backend/` directory
- Delete `docker-compose.yml` (already done in 001)
- Move `setup/` utility tests into `test/unit/` and delete `setup/` as standalone
- Update `package.json` at root (was `setup/package.json`; promote to root)
- Update `CLAUDE.md` — new architecture, new setup instructions, no Python section
- Update `README.md` — `npm install -g cockpit`, `cockpit init`, `cockpit start`
- Smoke test: `cockpit init --yes` + `cockpit start` + `cockpit status` all succeed on CI

## Complexity Tracking

No constitution violations. All principles satisfied as documented in Constitution Check above.
