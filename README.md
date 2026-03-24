# Cockpit

Cockpit is a GitHub-native AI pipeline that watches for `[COCKPIT]`-prefixed issues in any GitHub repo, runs the full spec-kit pipeline (specify → clarify → plan → tasks → analyze → implement) inside your local repo clone, and posts progress back as issue comments — all powered by Claude Code.

**Open an issue from your phone. Watch Claude build the feature.**

## Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| Node.js 18+ | `nvm install --lts` |
| Python 3.11+ | system package manager |
| `gh` | `apt install gh` |
| `claude` | `npm install -g @anthropic-ai/claude-code` |
| `uv` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

### 1. Clone and run setup

```bash
git clone https://github.com/your-org/cockpit ~/repos/cockpit
cd ~/repos/cockpit
npm --prefix setup install
node setup/index.js
```

The interactive setup will:
- Collect your GitHub token, repos to watch, and local repo paths
- Write a `.env` file and a platform-appropriate service file (systemd or launchd)
- Optionally install `specify-cli` (spec-kit) via `uv tool install`

### 2. Install the Python dependencies

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. Start the service

**Linux**:
```bash
sudo cp cockpit-api@<user>.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cockpit-api@<user>
```

**macOS**:
```bash
launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist
```

### 4. Trigger the pipeline

Open an issue in your watched repo:
```
[COCKPIT] <feature description>
```

Cockpit picks it up within `GITHUB_POLL_INTERVAL` seconds and starts the pipeline.

## Issue Naming

```
[COCKPIT] add user authentication
[COCKPIT] fix checkout timeout bug
[COCKPIT] refactor payment module
```

Only issues from `GITHUB_OWNER` are processed.

## Documentation

See [CLAUDE.md](CLAUDE.md) for full documentation: architecture, configuration reference, ops commands, and design decisions.

## Testing

```bash
cd backend
.venv/bin/pytest tests/ -q
```
