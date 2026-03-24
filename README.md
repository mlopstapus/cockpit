# Cockpit

Watches for `[COCKPIT]`-prefixed GitHub Issues, runs the spec-kit pipeline inside the target repo, and posts progress back as issue comments.

**GitHub is the interface.** Open an issue from your phone, watch the comments roll in.

## Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Node.js | 18+ | Required |
| git | any | Required |
| `claude` (Claude Code CLI) | latest | Required |
| `uv` | any | Optional (for spec-kit auto-install) |

## Quick Start

```bash
npm install -g cockpit
cockpit init
cockpit status
```

Or non-interactive (for scripts/CI):

```bash
GITHUB_TOKEN=ghp_... \
GITHUB_OWNER=myuser \
GITHUB_REPOS=myuser/myrepo \
REPO_LOCAL_PATHS='{"myuser/myrepo":"/home/user/repos/myrepo"}' \
cockpit init --yes
```

## How It Works

1. Open an Issue titled `[COCKPIT] <feature name>` in a watched repo
2. Cockpit detects it within 30 seconds and posts an acknowledgement
3. The spec-kit pipeline runs: `specify → clarify → plan → tasks → analyze → implement`
4. Progress comments appear on the issue as each stage completes
5. When done, a PR is opened and linked back to the issue

## CLI

```
cockpit init [--yes]              Setup wizard (writes ~/.cockpit/config.json + service file)
cockpit start                     Start the background daemon
cockpit stop                      Stop the background daemon
cockpit restart                   Restart the background daemon
cockpit status                    Show daemon health, active job, watched repos
cockpit logs [job-id] [-n N]      Tail daemon logs or a specific job's log
cockpit repos list                List watched repos
cockpit repos add <repo> <path>   Add a repo to watch (owner/name format)
cockpit repos remove <repo>       Remove a repo
cockpit token                     Rotate the GitHub personal access token
```

## Configuration

Config lives at `~/.cockpit/config.json` (permissions: 600).

```json
{
  "githubToken": "ghp_...",
  "githubOwner": "your-username",
  "pollIntervalSeconds": 30,
  "postImplementCommand": "",
  "repos": [
    { "repo": "owner/name", "localPath": "/path/to/local/clone" }
  ]
}
```

The daemon re-reads config at the start of every poll cycle — no restart needed for changes.

## Issue Naming

```
[COCKPIT] <feature description>
```

Only issues opened by the configured `githubOwner` are processed. Examples:
- `[COCKPIT] add user authentication`
- `[COCKPIT] fix onboarding crash`

## Development

```bash
git clone https://github.com/yourorg/cockpit
cd cockpit
npm install
npm test          # run unit + integration tests
npm run build     # verify native modules (better-sqlite3, node-pty)
npm run lint      # ESLint
```

## Architecture

- **No Docker, no Redis, no Python** — pure Node.js 18+ with SQLite
- **Service manager**: systemd (Linux) or launchd (macOS)
- **State**: `~/.cockpit/cockpit.db` (SQLite, WAL mode)
- **PTY**: `node-pty` for real terminal spawning of Claude Code
- **GitHub**: `@octokit/rest` with ETag caching (304s don't count against rate limits)
