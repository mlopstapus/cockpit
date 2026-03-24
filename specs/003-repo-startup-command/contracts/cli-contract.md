# CLI Contract: Repo Startup Commands

**Feature**: 003-repo-startup-command
**Date**: 2026-03-24

## `cockpit repos add`

### Current signature
```
cockpit repos add <owner/repo> <path>
```

### Updated signature
```
cockpit repos add <owner/repo> <path> [--startup-command <cmd>]
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `<owner/repo>` | positional string | yes | GitHub repo in `owner/name` format |
| `<path>` | positional string | yes | Absolute path to local clone |
| `--startup-command <cmd>` | string | no | Shell command to run after implement stage |

### Behaviour

| Scenario | Outcome |
|----------|---------|
| New repo, no `--startup-command` | Repo added with no `startupCommand` field (backward compat) |
| New repo, `--startup-command "docker compose up -d --build"` | Repo added; entry includes `startupCommand` |
| Existing repo, `--startup-command` provided | Entry updated in-place; `startupCommand` set/overwritten |
| Existing repo, no `--startup-command` | Warning logged; no change (existing behaviour preserved) |

### Examples

```bash
# Add new repo with startup command
cockpit repos add myuser/myapp /home/user/repos/myapp \
  --startup-command "docker compose up -d --build"

# Add repo without startup command (backward compat)
cockpit repos add myuser/myapp /home/user/repos/myapp

# Update existing repo's startup command
cockpit repos add myuser/myapp /home/user/repos/myapp \
  --startup-command "/home/user/repos/myapp/scripts/start.sh"
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Invalid repo format or config write failure |

---

## `cockpit repos list` (unchanged)

Lists repos; will display `startupCommand` if set.

### Updated output format

```
Watched repos:
  owner/repo  →  /local/path  [exists]
  owner/repo2  →  /local/path2  [exists]  startup: docker compose up -d --build
```

---

## Daemon Behaviour Contract

After every successful implement stage for a repo with `startupCommand` configured:

1. Run `sh -c "<startupCommand>"` with `cwd = localPath`
2. Apply 5-minute timeout (300,000 ms)
3. On exit code 0: post `✅ **Startup command completed**` comment with last 50 lines of output
4. On non-zero exit or timeout: post `⚠️ **Startup command failed** (exit <code>)` comment with last 50 lines
5. Proceed to job completion regardless of startup command outcome (failure is reported, not blocking)

**Note**: Failure of the startup command does NOT mark the job as failed. The implement stage succeeded; the startup is best-effort notification.
