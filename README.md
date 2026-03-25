# Cockpit [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Open a GitHub Issue, watch Claude build the feature and open a PR — from your phone.

Cockpit watches for `[COCKPIT]`-prefixed Issues in configured repos, runs a full spec-kit pipeline inside those repos using Claude Code, and posts progress back as issue comments. **GitHub is the interface.** No frontend, no dashboard, no fuss.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | Required |
| git | any | Required |
| `claude` (Claude Code CLI) | latest | Required — [install here](https://docs.anthropic.com/en/docs/claude-code) |
| GitHub account | — | Required |
| GitHub PAT | — | Required — `repo` scope; create at GitHub → Settings → Developer settings → Personal access tokens |

> macOS and Linux are supported. Windows is not currently supported.

## Quick Start

```bash
# 1. Install
npm install -g cockpit

# 2. Run the setup wizard
cockpit init

# 3. Start the background daemon
cockpit start

# 4. Open your first job
#    Create a GitHub Issue titled: [COCKPIT] <feature description>
#    Cockpit picks it up within pollIntervalSeconds (default: 30s)
```

Non-interactive setup (CI/scripts):

```bash
GITHUB_TOKEN=ghp_... \
GITHUB_OWNER=myuser \
GITHUB_REPOS=myuser/myrepo \
REPO_LOCAL_PATHS='{"myuser/myrepo":"/home/user/repos/myrepo"}' \
cockpit init --yes
```

Verify everything is running:

```bash
cockpit status
```

## How It Works

1. Open an Issue titled `[COCKPIT] <feature name>` in a watched repo
2. Cockpit detects it within `pollIntervalSeconds` seconds and posts an acknowledgement comment
3. The spec-kit pipeline runs inside the local repo clone: `specify → clarify → plan → tasks → analyze → implement`
4. During `clarify`, questions are posted as issue comments — answer from your phone
5. When done, Claude opens a PR and links it back to the issue

## Architecture

```text
GitHub Issue ([COCKPIT] ...)
  ↓ polling (GithubWatcher — ETag-cached)
SQLite job queue (~/.cockpit/cockpit.db)
  ↓ dequeue (PollLoop — one job at a time)
Claude Code --dangerously-skip-permissions
  spawned in the configured local repo clone (node-pty)
  ↓ spec-kit stages (specify → clarify → plan → tasks → analyze → implement)
Issue comments  ←  stage transitions + clarify Q&A
  ↓ implement stage completes
PR created by Claude → linked in issue
```

**Stack**: Node.js 18+ · SQLite (WAL) · node-pty · @octokit/rest · systemd / launchd

> [!NOTE]
> **Security & Trust**
>
> - `--dangerously-skip-permissions` grants Claude Code full file-system and shell access **within your local repo clone**
> - Claude runs entirely on your machine — there is no cloud agent or remote execution
> - Nothing leaves your machine except GitHub API calls (issue comments and PR creation)
> - Cockpit does not send your code to any third-party service beyond what Claude Code itself does
> - Review each PR before merging — you are the last gate

## CLI

```text
cockpit init [--yes]                     Setup wizard (writes ~/.cockpit/config.json + service file)
cockpit start                            Start the background daemon
cockpit stop                             Stop the background daemon
cockpit restart                          Restart the background daemon
cockpit status                           Show daemon health, active job, queue depth, and watched repos
cockpit logs [job-id] [-n N] [-f]        Tail daemon logs or a specific job's log (-f to follow)
cockpit jobs [-n N]                      List recent jobs and their status
cockpit repos list                       List watched repos
cockpit repos add <owner/repo> <path>    Add a repo to watch
cockpit repos remove <owner/repo>        Remove a repo
cockpit token                            Rotate the GitHub personal access token
cockpit daemon                           Start the daemon process (internal — use cockpit start instead)
```

## Configuration

Config lives at `~/.cockpit/config.json` (chmod 600). The daemon re-reads this file at the start of every poll cycle — no restart needed for changes.

```json
{
  "githubToken": "ghp_...",
  "githubOwner": "your-username",
  "pollIntervalSeconds": 30,
  "postImplementCommand": "",
  "repos": [
    {
      "repo": "owner/name",
      "localPath": "/path/to/local/clone",
      "startupCommand": ""
    }
  ]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `githubToken` | required | GitHub PAT with `repo` scope |
| `githubOwner` | required | Only issues from this account are processed |
| `pollIntervalSeconds` | `30` | Seconds between GitHub polls |
| `postImplementCommand` | `""` | Shell command run after every successful implement stage (e.g. `npm run build`) |
| `repos[].repo` | required | Repo in `owner/name` format |
| `repos[].localPath` | required | Absolute path to the local clone |
| `repos[].startupCommand` | `""` | Shell command run after the implement stage completes for this repo (5-minute timeout) |

## Issue Naming

```text
[COCKPIT] <feature description>
```

Only issues opened by the configured `githubOwner` are processed. Examples:

- `[COCKPIT] add user authentication`
- `[COCKPIT] fix onboarding crash`
- `[COCKPIT] refactor the payment flow`

## Q&A

### Does Cockpit cost money to use?

Cockpit itself is free and open source. Running it requires a Claude API subscription (or Claude Code Pro/Max plan) for the Claude Code CLI that executes the pipeline. GitHub API usage stays within free-tier rate limits for normal workloads.

### What platforms are supported?

macOS and Linux. Windows is not currently supported. The daemon relies on systemd (Linux) or launchd (macOS) for background service management, and on `node-pty` for real terminal spawning.

### What happens if the daemon crashes mid-job?

The job stays in the queue with its last-known status. On restart, Cockpit picks up from the queue and retries the job. If it fails 3 times, it is marked as failed and you will see it in `cockpit status`. No partial work is lost — Claude's progress up to that point is in the issue comments and any branch commits already pushed.

### How do I add more repos without re-running init?

```bash
cockpit repos add owner/repo /path/to/local/clone
```

Or edit `~/.cockpit/config.json` directly — the daemon hot-reloads config on the next poll cycle.

### How do I answer clarification questions during a job?

Reply in the GitHub Issue comments. Cockpit polls for new comments during the `clarify` stage and feeds your answers back to Claude. You can do this from the GitHub mobile app.

### Will Cockpit auto-merge the PR it creates?

No. Cockpit creates a PR and links it to the issue, then stops. Reviewing and merging is always a manual step. Auto-merge is explicitly out of scope by design.

### Can Cockpit run multiple jobs in parallel?

No. Jobs run sequentially (FIFO queue). This is intentional — running multiple Claude Code sessions simultaneously on the same machine creates resource contention and makes logs harder to follow. Queue a second issue and it will start as soon as the first job finishes.

### Does my code leave my machine?

Only in two ways you control: (1) Claude Code may call the Claude API with file contents as context — this is governed by Anthropic's usage policies, the same as using Claude Code interactively. (2) Cockpit posts issue comments and creates PRs via the GitHub API using the PAT you configured. No other outbound connections are made.

## Troubleshooting

### Daemon not running / won't start

```bash
cockpit status          # check current state
cockpit start           # attempt to start
cockpit logs -n 50      # check recent daemon logs for errors
```

On Linux, also check: `systemctl --user status cockpit`
On macOS: `launchctl list | grep cockpit`

If the service file is missing, re-run `cockpit init` to regenerate it.

### Issues not being picked up

1. Run `cockpit status` — confirm the daemon is running and the repo is listed
2. Check that the issue author matches `githubOwner` in your config (only issues from that account are processed)
3. Confirm the issue title starts with `[COCKPIT] ` (with a space after the bracket)
4. Check `pollIntervalSeconds` — the default is 30 seconds; the issue won't appear until the next poll
5. Run `cockpit logs -f` to watch polls in real time

### Rate limit hit

Cockpit detects Claude API rate limits automatically from process output and marks the job as `rate_limited` with a reset timestamp. It will auto-requeue the job after the reset time. Check current status:

```bash
cockpit status          # shows rate_limited state and reset time
cockpit logs -n 100     # see rate limit details
```

No manual action is needed — just wait. If it doesn't auto-recover, run `cockpit restart`.

### Auth / token errors

Ensure your GitHub PAT has the `repo` scope (full repository access). Fine-grained tokens need: `Contents` read/write, `Issues` read/write, `Pull requests` read/write.

To rotate the token:

```bash
cockpit token
```

Then re-run the failing job by opening a new `[COCKPIT]` issue.

### macOS: daemon not restarting after a Cockpit update

launchd exits the daemon cleanly on `SIGTERM` and does not auto-restart it (by design — this avoids loops on deliberate stops). After updating Cockpit, manually restart:

```bash
cockpit restart
```

## Development

```bash
git clone https://github.com/andersbe/cockpit
cd cockpit
npm install
npm test          # run all tests (node:test)
npm run build     # verify native modules compile (better-sqlite3, node-pty)
npm run lint      # ESLint
node src/daemon/index.js   # run daemon directly (development mode)
```

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for bug reports, feature requests, and the PR workflow.
