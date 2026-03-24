# Cockpit — Issue-Driven Spec Pipeline

Cockpit watches for `[COCKPIT]`-prefixed GitHub Issues in configured repos, runs the
spec-kit pipeline inside those repos, and posts progress back as issue comments.

**GitHub is the interface.** No frontend. Open an issue from your phone, watch the
comments roll in.

## How It Works

1. Open an **Issue** in your watched repo titled `[COCKPIT] <feature-name>`
2. Cockpit detects it within `GITHUB_POLL_INTERVAL` seconds
3. Cockpit `cd`s into the local clone and spawns Claude with `--dangerously-skip-permissions`
4. Spec-kit runs: `specify → clarify → plan → tasks → analyze → implement`
5. During `clarify`, questions are posted as issue comments — answer from your phone
6. When done, Claude creates a feature branch and opens a PR; the issue gets a link

## Architecture

```
GitHub Issue ([COCKPIT] ...)
  ↓ polling (GithubWatcher)
SQLite job queue (~/.cockpit/cockpit.db)
  ↓ dequeue (PipelineRunner)
Claude Code --dangerously-skip-permissions
  in configured target repo
  ↓ spec-kit stages
Issue comments (stage transitions, clarify Q&A)
  ↓ implement stage
PR created by Claude → linked in issue
```

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| GithubWatcher | `services/github_watcher.py` | Polls GitHub issues, enqueues jobs |
| JobStore | `services/job_store.py` | SQLite-backed embedded store (jobs, logs, dedup) |
| PipelineRunner | `services/pipeline_runner.py` | Sequential stage execution |
| PRCommenter | `services/pr_commenter.py` | Posts stage comments to issue |
| CommentRelay | `services/comment_relay.py` | Clarify Q&A, steering injection |
| AccountRotator | `services/account_rotator.py` | Rate limit detection + rotation |
| ClaudeProcess | `services/claude_process.py` | PTY-based Claude CLI wrapper |

## Configuration (env vars)

```
GITHUB_TOKEN          GitHub personal access token (repo + issues scope)
GITHUB_OWNER          Your GitHub username or organisation
GITHUB_REPOS          Comma-separated repos to watch (e.g. owner/repo1,owner/repo2)
                      Do NOT use JSON array format — plain comma-separated only
GITHUB_POLL_INTERVAL  Seconds between polls (default: 30)
DB_PATH               SQLite database path (default: ~/.cockpit/cockpit.db)
REPO_LOCAL_PATHS      JSON map of "owner/repo" → local path
                      e.g. '{"your-org/your-repo":"/home/user/repos/your-repo"}'
PROFILES_DIR          Claude profile directory (default: ~/.claude-profiles)
PR_COMMENTS_ENABLED   Set false to suppress issue comments (useful for testing)
POST_IMPLEMENT_COMMAND  Optional shell command run after each successful implement stage
                        Executed via /bin/sh -c — full shell syntax supported
                        Leave empty to disable (default: no hook)
                        Expo migration: POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo
```

## Installs & Dependencies

Claude runs on the **host OS** (no Docker), so any installs it performs happen on the host machine directly.

### Prerequisites

Node.js 18+ is required for the setup CLI:
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

### Target repo (e.g. `~/repos/my-project`)
- **npm/yarn packages**: `npm install <pkg>` — go into the target repo's `node_modules`
- **Python packages**: use the target repo's virtualenv if it has one, otherwise `pip install --user <pkg>`

### Cockpit itself (`~/repos/cockpit`)
- **Python deps**: add to `backend/requirements.txt`, then `cd backend && .venv/bin/pip install -r requirements.txt`
- **System tools** (e.g. `gh`, `jq`): install via `apt` or the appropriate system package manager; document the dependency in this file

### System-level tools

| Tool | Install | Purpose |
|------|---------|---------|
| `gh` | `apt install gh` | GitHub CLI — used by spec-kit to open PRs |
| `claude` | npm global | Claude Code CLI — spawned by PipelineRunner |
| `node` / `npm` | nvm | Required for setup CLI |
| `uv` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | Python tool manager — installs specify-cli |

## Running

The API runs as a systemd (Linux) or launchd (macOS) service on the host so that
`claude` spawns with a real host PTY and repo paths resolve correctly. No Docker required.

### 1. Run the setup CLI (first time)

```bash
node setup/index.js
```

This will:
- Prompt for your GitHub token, repos, and local paths
- Write a `.env` file and a platform-appropriate service file
- Optionally install `specify-cli` via `uv tool install`
- Print instructions to start the service and initialise spec-kit

### 2. Set up the Python virtualenv (first time)

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. Enable the service

**Linux (systemd)**:
```bash
sudo cp cockpit-api@<user>.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cockpit-api@<user>
```

**macOS (launchd)**:
```bash
launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist
```

### 4. Useful ops commands

**Linux**:
```bash
sudo systemctl status cockpit-api@<user>
journalctl -u cockpit-api@<user> -f          # tail logs
sudo systemctl restart cockpit-api@<user>
```

**macOS**:
```bash
launchctl list | grep cockpit
tail -f ~/Library/Logs/cockpit-api.log
launchctl unload ~/Library/LaunchAgents/com.cockpit.api.plist && launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist
```

### Networking / VPN

Cockpit accesses localhost services in the target repo. Any VPN or network setup is optional
and handled outside Cockpit. Tailscale is well-documented for remote access but is not required.

## Testing

```bash
cd backend
.venv/bin/pytest tests/ -q
```

## Tech Stack

- **Backend**: FastAPI, Python 3.11+
- **Agent**: Claude Code CLI (host PTY, `--dangerously-skip-permissions`)
- **State**: SQLite via aiosqlite (`~/.cockpit/cockpit.db`) — no external services
- **Setup**: Node.js 18+ CLI (`node setup/index.js`)

## Design Decisions

- **Issues not PRs** — no need for code changes to trigger the pipeline; Claude creates the branch and PR
- **No frontend** — GitHub mobile is the interface
- **No DAG** — sequential spec-kit stages only
- **No auto-merge** — human reviews and merges PR
- **Host execution** — API runs as a system service; Claude spawns on the real host OS (needs git, TTY, tools). No Docker.
- **One job at a time** — FIFO queue, simpler and reliable
- **Embedded storage** — SQLite replaces Redis; zero external service dependency

## Issue Naming

```
[COCKPIT] <feature description>
```
Examples: `[COCKPIT] add user auth`, `[COCKPIT] fix onboarding crash`

Only issues from `GITHUB_OWNER` are processed.
