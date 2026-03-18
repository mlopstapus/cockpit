# Cockpit — Issue-Driven Spec Pipeline

Cockpit watches for `[COCKPIT]`-prefixed GitHub Issues in configured repos, runs the
spec-kit pipeline inside those repos, and posts progress back as issue comments.

**GitHub is the interface.** No frontend. Open an issue from your phone, watch the
comments roll in.

## How It Works

1. Open an **Issue** in `mlopstapus/seamless` titled `[COCKPIT] <feature-name>`
2. Cockpit detects it within `GITHUB_POLL_INTERVAL` seconds
3. Cockpit `cd`s into the local clone and spawns Claude with `--dangerously-skip-permissions`
4. Spec-kit runs: `specify → clarify → plan → tasks → analyze → implement`
5. During `clarify`, questions are posted as issue comments — answer from your phone
6. When done, Claude creates a feature branch and opens a PR; the issue gets a link

## Architecture

```
GitHub Issue ([COCKPIT] ...)
  ↓ polling (GithubWatcher)
Redis job queue
  ↓ dequeue (PipelineRunner)
Claude Code --dangerously-skip-permissions
  in ~/repos/seamless (or configured target repo)
  ↓ spec-kit stages
Issue comments (stage transitions, clarify Q&A)
  ↓ implement stage
PR created by Claude → linked in issue
```

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| GithubWatcher | `services/github_watcher.py` | Polls GitHub issues, enqueues jobs |
| JobStore | `services/job_store.py` | All Redis job state |
| PipelineRunner | `services/pipeline_runner.py` | Sequential stage execution |
| PRCommenter | `services/pr_commenter.py` | Posts stage comments to issue |
| CommentRelay | `services/comment_relay.py` | Clarify Q&A, steering injection |
| AccountRotator | `services/account_rotator.py` | Rate limit detection + rotation |
| ClaudeProcess | `services/claude_process.py` | PTY-based Claude CLI wrapper |

## Configuration (env vars)

```
GITHUB_TOKEN          GitHub personal access token (repo scope)
GITHUB_OWNER          Your GitHub username (e.g. mlopstapus)
GITHUB_REPOS          Comma-separated repos to watch (e.g. mlopstapus/seamless)
GITHUB_POLL_INTERVAL  Seconds between polls (default: 30)
REDIS_URL             Redis connection (default: redis://redis:6379)
REPO_LOCAL_PATHS      JSON map of "owner/repo" → local path
                      e.g. '{"mlopstapus/seamless":"/home/ben/repos/seamless"}'
PROFILES_DIR          Claude profile directory (default: ~/.claude-profiles)
PR_COMMENTS_ENABLED   Set false to suppress issue comments (useful for testing)
```

## Running

```bash
cp .env.example .env   # fill in GITHUB_TOKEN, GITHUB_OWNER, etc.
docker-compose up -d
docker-compose logs -f api
```

## Testing

```bash
cd backend
.venv/bin/pytest tests/ -q
```

## Tech Stack

- **Backend**: FastAPI, Python, Redis
- **Agent**: Claude Code CLI (host PTY, `--dangerously-skip-permissions`)
- **State**: Redis (jobs, logs, comment dedup)
- **Access**: Tailscale
- **Target repo**: `mlopstapus/seamless` (Expo/React Native mobile app)

## Design Decisions

- **Issues not PRs** — no need for code changes to trigger the pipeline; Claude creates the branch and PR
- **No frontend** — GitHub mobile is the interface
- **No DAG** — sequential spec-kit stages only
- **No auto-merge** — human reviews and merges PR
- **Host execution** — Claude runs on host OS, not in Docker (needs git, tools)
- **One job at a time** — FIFO queue, simpler and reliable

## Issue Naming

```
[COCKPIT] <feature description>
```
Examples: `[COCKPIT] add user auth`, `[COCKPIT] fix onboarding crash`

Only issues from `GITHUB_OWNER` are processed.
