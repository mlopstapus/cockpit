# Cockpit — PR-Driven Spec Pipeline

Cockpit watches for `[COCKPIT]`-prefixed GitHub PRs in configured repos, runs the
spec-kit pipeline inside those repos, and posts progress back as PR comments.

**GitHub is the interface.** No frontend. Open a PR from your phone, watch the
comments roll in.

## How It Works

1. Open a PR in `mlopstapus/seamless` titled `[COCKPIT] <feature-name>`
2. Cockpit detects it within `GITHUB_POLL_INTERVAL` seconds
3. Cockpit `cd`s into the local clone and spawns Claude with `--dangerously-skip-permissions`
4. Spec-kit runs: `specify → clarify → plan → tasks → analyze → implement`
5. During `clarify`, questions are posted as PR comments — answer from your phone
6. When done, the feature branch is pushed and the PR is updated with all artifacts

## Architecture

```
GitHub PR ([COCKPIT] ...)
  ↓ polling (GithubWatcher)
Redis job queue
  ↓ dequeue (PipelineRunner)
Claude Code --dangerously-skip-permissions
  in ~/repos/seamless (or configured target repo)
  ↓ spec-kit stages
PR comments (stage transitions, clarify Q&A)
```

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| GithubWatcher | `services/github_watcher.py` | Polls GitHub, enqueues jobs |
| JobStore | `services/job_store.py` | All Redis job state |
| PipelineRunner | `services/pipeline_runner.py` | Sequential stage execution |
| PRCommenter | `services/pr_commenter.py` | Posts stage comments to PR |
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
PR_COMMENTS_ENABLED   Set false to suppress PR comments (useful for testing)
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
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest pytest-asyncio fakeredis
.venv/bin/python -m pytest tests/ -q
```

## Tech Stack

- **Backend**: FastAPI, Python, Redis
- **Agent**: Claude Code CLI (host PTY, `--dangerously-skip-permissions`)
- **State**: Redis (jobs, logs, comment dedup)
- **Access**: Tailscale
- **Target repo**: `mlopstapus/seamless` (Expo/React Native mobile app)

## Design Decisions

- **No frontend** — GitHub mobile is the interface
- **No DAG** — sequential spec-kit stages only
- **No auto-merge** — human reviews and merges PR
- **Host execution** — Claude runs on host OS, not in Docker (needs git, tools)
- **One job at a time** — FIFO queue, simpler and reliable

## PR Naming

```
[COCKPIT] <feature description>
```
Examples: `[COCKPIT] add user auth`, `[COCKPIT] fix onboarding crash`

Only PRs from `GITHUB_OWNER` are processed.
