# CLI Contract: `cockpit` Commands

**Branch**: `002-nodejs-rewrite` | **Date**: 2026-03-24

This document defines the complete command surface of the `cockpit` CLI binary.

---

## Top-Level Commands

```
cockpit <command> [options]

Commands:
  init          Interactive setup wizard (first-time configuration)
  start         Start the background daemon
  stop          Stop the background daemon
  restart       Restart the background daemon
  status        Show daemon health and current job state
  logs [job-id] Print recent daemon logs (or full log for a job)
  repos         Manage watched repositories (subcommands below)
  token         Update the GitHub personal access token
  daemon        Internal: run the daemon process (called by service manager)
  help          Show help
```

---

## `cockpit init`

**Description**: Interactive TUI wizard for first-time (and repeat) setup.

**Flags**:
| Flag | Description |
|------|-------------|
| `--yes` | Non-interactive mode; reads values from environment variables |
| `--target <dir>` | Override config output directory (default: `~/.cockpit`) |

**Flow**:
1. Check prerequisites: `git`, `claude` on PATH (exit code 2 if missing); warn if `uv` missing
2. If existing config detected: prompt to update or cancel
3. Collect: GitHub token (masked input), GitHub owner, one or more repos with local paths
4. Detect OS → write systemd unit (Linux) or launchd plist (macOS) to standard location
5. Write `~/.cockpit/config.json` with permissions 0o600
6. Optionally install `specify-cli` via `uv tool install specify-cli`
7. Print next steps: `cockpit start`, `cockpit status`

**Exit codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User cancelled |
| 2 | Missing required prerequisite (`git` or `claude`) |

**Environment variables read in `--yes` mode**:
| Var | Maps to |
|-----|---------|
| `GITHUB_TOKEN` | `githubToken` |
| `GITHUB_OWNER` | `githubOwner` |
| `GITHUB_REPOS` | comma-separated `owner/name` values |
| `REPO_LOCAL_PATHS` | JSON map `{"owner/name": "/path"}` |
| `POLL_INTERVAL` | `pollIntervalSeconds` (default: 30) |
| `POST_IMPLEMENT_COMMAND` | `postImplementCommand` |

---

## `cockpit start`

**Description**: Start the background daemon via the OS service manager.

**Behaviour**:
- Linux: `systemctl --user start cockpit-daemon`
- macOS: `launchctl start com.cockpit.daemon`
- If daemon already running: print notice and exit 0

**Exit codes**: 0 success, 1 error

---

## `cockpit stop`

**Description**: Stop the background daemon.

**Behaviour**:
- Linux: `systemctl --user stop cockpit-daemon`
- macOS: `launchctl stop com.cockpit.daemon`
- Remove `~/.cockpit/daemon.pid` if present

**Exit codes**: 0 success, 1 error

---

## `cockpit restart`

**Description**: Restart the daemon, picking up any config changes.

**Behaviour**:
- Linux: `systemctl --user restart cockpit-daemon` (atomic)
- macOS: stop then start with 1s delay

**Exit codes**: 0 success, 1 error

---

## `cockpit status`

**Description**: Show daemon health and current job state.

**Output format** (human-readable, no flags for machine format in v1):
```
Cockpit status
  Daemon:     running (PID 12345)
  Uptime:     2h 14m
  Watched:    owner/repo-1, owner/repo-2
  Queue:      0 jobs waiting
  Active job: none
```

If a job is active:
```
  Active job: #42 "add user auth" (implement stage, 4m 32s elapsed)
```

**Exit codes**: 0 running, 1 stopped or error

---

## `cockpit logs [job-id]`

**Description**: Print log output.

**Without job-id**: Print the last 50 lines of daemon system logs.

**With job-id**: Print the full captured Claude output for that job (up to 1000 lines).

**Flags**:
| Flag | Description |
|------|-------------|
| `-n <lines>` | Number of lines to show (default: 50, max: 1000) |
| `-f` | Follow — tail logs in real time (daemon logs only, no job-id) |

**Exit codes**: 0 success, 1 job not found

---

## `cockpit repos`

**Subcommands**:

### `cockpit repos list`

Print the current watched repos with their local paths.

```
Watched repositories:
  owner/repo-1  →  /home/user/repos/repo-1  [exists]
  owner/repo-2  →  /home/user/repos/repo-2  [missing]
```

### `cockpit repos add <owner/repo> <local-path>`

Add a repo to the watch list. Writes to `config.json`; takes effect on next poll cycle.

**Validation**:
- `owner/repo` format enforced (error if malformed)
- If `local-path` does not exist on disk: print warning, proceed anyway

**Exit codes**: 0 success, 1 validation error

### `cockpit repos remove <owner/repo>`

Remove a repo from the watch list. Writes to `config.json`; takes effect on next poll cycle.

**Exit codes**: 0 success, 1 repo not found in config

---

## `cockpit token`

**Description**: Update the GitHub personal access token interactively.

**Flow**:
1. Prompt for new token (masked input)
2. Optionally validate token against GitHub API (print warning if invalid but proceed)
3. Write to `config.json` (permissions preserved at 0o600)
4. Print: "Token updated. Takes effect on next poll cycle."

**Exit codes**: 0 success, 1 user cancelled

---

## `cockpit daemon`

**Description**: Internal command. Runs the polling daemon loop in the foreground. Called by systemd/launchd service definition — not intended for direct user invocation.

**Behaviour**:
- Writes PID to `~/.cockpit/daemon.pid` on start
- Removes PID file on clean shutdown (SIGTERM handler)
- Re-reads `~/.cockpit/config.json` at the start of each poll cycle
- Logs to stdout/stderr (captured by journalctl/launchd)

**Exit codes**: 0 clean shutdown, 1 fatal startup error (missing config, missing prerequisites)
