# Cockpit — Issue-Driven Spec Pipeline

Cockpit watches for `[COCKPIT]`-prefixed GitHub Issues in configured repos, runs the
spec-kit pipeline inside those repos, and posts progress back as issue comments.

**GitHub is the interface.** No frontend. Open an issue from your phone, watch the
comments roll in.

## How It Works

1. Open an **Issue** in any watched repo titled `[COCKPIT] <feature-name>`
2. Cockpit detects it within `pollIntervalSeconds` seconds (default: 30)
3. Cockpit `cd`s into the local clone and spawns Claude with `--dangerously-skip-permissions`
4. Spec-kit runs: `specify → clarify → plan → tasks → analyze → implement`
5. During `clarify`, questions are posted as issue comments — answer from your phone
6. When done, Claude creates a feature branch and opens a PR; the issue gets a link

## Architecture

```
GitHub Issue ([COCKPIT] ...)
  ↓ polling (GithubWatcher)
SQLite job queue (~/.cockpit/cockpit.db)
  ↓ dequeue (PollLoop)
Claude Code --dangerously-skip-permissions
  in the configured local repo clone
  ↓ spec-kit stages (specify → clarify → plan → tasks → analyze → implement)
Issue comments (stage transitions, clarify Q&A)
  ↓ implement stage
PR created by Claude → linked in issue
```

## Key Modules

| Module | File | Purpose |
|--------|------|---------|
| CLI entry | `src/cli/index.js` | Commander root program, all subcommands |
| Init wizard | `src/cli/init.js` | `cockpit init` TUI setup wizard |
| Daemon entry | `src/daemon/index.js` | `start()`, crash recovery, PID file |
| Poll loop | `src/daemon/poller.js` | Hot config reload, per-repo polling |
| Job runner | `src/daemon/job-runner.js` | Dequeue + execute one job at a time |
| Stage executor | `src/daemon/stage-executor.js` | Claude spawn, sentinel detection, commenting |
| Claude process | `src/process/claude-process.js` | node-pty wrapper, LineBuffer, sentinel regex |
| GitHub watcher | `src/github/watcher.js` | Poll issues, filter, sanitise, enqueue |
| GitHub commenter | `src/github/commenter.js` | Post and list issue/PR comments |
| Octokit client | `src/github/client.js` | ETag cache, RateLimitError |
| DB schema | `src/db/index.js` | openDb, 6-table SQLite schema, WAL |
| Jobs | `src/db/jobs.js` | enqueue/dequeue/mark* CRUD |
| Logs | `src/db/logs.js` | appendLog, getLogTail, 1000-line buffer |
| Config | `src/config/index.js` | readConfig, writeConfig (chmod 600), validate |
| Daemon control | `src/cli/daemon-control.js` | start/stop/restart/status |
| Logs CLI | `src/cli/logs.js` | `cockpit logs [job-id]` |
| Repos CLI | `src/cli/repos.js` | `cockpit repos list/add/remove` |
| Token CLI | `src/cli/token.js` | `cockpit token` rotation |

## Configuration (`~/.cockpit/config.json`, chmod 600)

```json
{
  "githubToken": "ghp_...",
  "githubOwner": "your-username",
  "pollIntervalSeconds": 30,
  "postImplementCommand": "",
  "repos": [
    { "repo": "owner/name", "localPath": "/home/user/repos/name" }
  ]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `githubToken` | required | GitHub PAT with `repo` scope |
| `githubOwner` | required | Only issues from this account are processed |
| `pollIntervalSeconds` | 30 | Seconds between GitHub polls |
| `postImplementCommand` | "" | Shell command run after successful implement |
| `repos` | required | Array of `{ repo, localPath }` |

Config is re-read at the start of every poll cycle — no daemon restart needed for changes.

## Install & Setup

```bash
# Prerequisites: Node.js 18+, git, claude (Claude Code CLI)
npm install -g cockpit    # or: npm link (from repo root)
cockpit init              # interactive TUI wizard
cockpit status            # verify daemon is running
```

For non-interactive setup (CI/scripts):
```bash
GITHUB_TOKEN=ghp_... GITHUB_OWNER=myuser \
GITHUB_REPOS=myuser/myrepo \
REPO_LOCAL_PATHS='{"myuser/myrepo":"/home/user/repos/myrepo"}' \
cockpit init --yes
```

## Running

The daemon runs as a background service (systemd on Linux, launchd on macOS).
`cockpit init` writes and enables the service file automatically.

```bash
cockpit start            # start daemon
cockpit stop             # stop daemon
cockpit restart          # restart daemon
cockpit status           # health check + active job + watched repos
```

### Manual daemon start (development)

```bash
node src/daemon/index.js
```

## CLI Reference

```
cockpit init [--yes] [--target <dir>]   Setup wizard
cockpit start                           Start background daemon
cockpit stop                            Stop background daemon
cockpit restart                         Restart background daemon
cockpit status                          Show health + active job
cockpit logs [job-id] [-n <N>] [-f]     Tail logs
cockpit repos list                      List watched repos
cockpit repos add <owner/repo> <path>   Add repo
cockpit repos remove <owner/repo>       Remove repo
cockpit token                           Rotate GitHub token
```

## Testing

```bash
npm test                  # run all tests (node:test)
npm run build             # verify native modules compile (better-sqlite3, node-pty)
npm run lint              # ESLint
```

## Tech Stack

- **Runtime**: Node.js 18+ ESM
- **Agent**: Claude Code CLI (host PTY, `--dangerously-skip-permissions`)
- **State**: SQLite via `better-sqlite3` (WAL mode, `~/.cockpit/cockpit.db`)
- **PTY**: `node-pty` (real terminal for Claude Code)
- **GitHub**: `@octokit/rest` with ETag caching
- **CLI**: `commander@12`, `@clack/prompts`, `chalk`
- **Service**: systemd (Linux) or launchd (macOS) — no Docker required

## Design Decisions

- **Issues not PRs** — no code changes required to trigger the pipeline
- **No frontend** — GitHub mobile is the interface
- **No DAG** — sequential spec-kit stages only
- **No auto-merge** — human reviews and merges PR
- **Host execution** — daemon runs directly on the host OS; Claude needs git, TTY, tools
- **One job at a time** — FIFO queue, simpler and reliable
- **Config hot-reload** — re-read config.json at start of each poll cycle; no IPC needed
- **Zero external services** — no Redis, no Docker, no Python

## Issue Naming

```
[COCKPIT] <feature description>
```
Examples: `[COCKPIT] add user auth`, `[COCKPIT] fix onboarding crash`

Only issues from `githubOwner` are processed.
