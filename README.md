# Cockpit

Watches for `[COCKPIT]`-prefixed GitHub Issues, runs the spec-kit pipeline inside the target repo, and posts progress back as issue comments.

**GitHub is the interface.** Open an issue from your phone, watch the comments roll in.

## How It Works

1. Open an Issue in `mlopstapus/seamless` titled `[COCKPIT] <feature description>`
2. Cockpit detects it within `GITHUB_POLL_INTERVAL` seconds
3. Claude Code runs inside the local repo clone with `--dangerously-skip-permissions`
4. Spec-kit stages run: `specify → clarify → plan → tasks → analyze → implement`
5. During `clarify`, questions are posted as issue comments — answer from your phone
6. Claude opens a PR and links it in the issue

## Setup

### Prerequisites

| Tool | Install | Purpose |
|------|---------|---------|
| `docker` | [docs.docker.com](https://docs.docker.com/engine/install/) | Runs Redis |
| `gh` | `apt install gh` | GitHub CLI — used by spec-kit to open PRs |
| `claude` | `npm install -g @anthropic-ai/claude-code` | Claude Code CLI |
| Python 3.12+ | system | API runtime |

### 1. Clone and configure

```bash
git clone https://github.com/mlopstapus/cockpit ~/repos/cockpit
cd ~/repos/cockpit
cp .env.example .env
# Edit .env — at minimum set GITHUB_TOKEN
```

### 2. Start Redis

```bash
docker-compose up -d
```

### 3. Set up the Python venv

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip3 install -r requirements.txt
```

### 4. Install the systemd service

```bash
# Replace ben-anderson with your Linux username
cd /home/ben-anderson/repos/cockpit
sudo cp cockpit-api.service /etc/systemd/system/cockpit-api@.service
sudo systemctl daemon-reload
sudo systemctl enable --now cockpit-api@ben-anderson
```

### 5. Verify

```bash
sudo systemctl status cockpit-api@ben-anderson
journalctl -u cockpit-api@ben-anderson -f
```

## Architecture

```
GitHub Issue ([COCKPIT] ...)
  ↓ polling (GithubWatcher)
Redis job queue
  ↓ dequeue (PipelineRunner)
Claude Code --dangerously-skip-permissions
  in ~/repos/seamless
  ↓ spec-kit stages
Issue comments (progress + clarify Q&A)
  ↓ implement stage
PR created by Claude → linked in issue
```

Redis runs in Docker. The API runs as a systemd service on the host so Claude has a real TTY and direct access to local repos.

## Ops

```bash
sudo systemctl restart cockpit-api@<user>
journalctl -u cockpit-api@<user> -f      # tail logs
docker-compose restart                    # restart Redis
```

## Testing

```bash
cd backend
.venv/bin/pytest tests/ -q
```
