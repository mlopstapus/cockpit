# Data Model: Repo Startup Commands

**Feature**: 003-repo-startup-command
**Date**: 2026-03-24

## Entities

### RepoConfig (extended)

The per-repo configuration object in `~/.cockpit/config.json`.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `repo` | string | yes | `owner/name` format | GitHub repo identifier |
| `localPath` | string | yes | non-empty | Absolute path to local clone |
| `startupCommand` | string | no | any string | Shell command run after implement; absent = skip |

**State**: Persisted in `config.json`; re-read at start of every poll cycle.

**Backward compatibility**: `startupCommand` absent/undefined → treated as "not configured" → no execution. Zero change to repos that don't set this field.

---

### StartupCommandResult

Transient value produced when the startup command runs. Not persisted to DB — used only for composing the GitHub issue comment.

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` if exit code 0 |
| `exitCode` | number \| null | Process exit code; null if timed out |
| `outputSnippet` | string | Last 50 lines of combined stdout+stderr |
| `elapsedMs` | number | Wall-clock time for the command |

---

## State Transitions

```
implement stage complete
        │
        ▼
[markComplete in DB]
        │
        ▼
global postImplementCommand? ──no──┐
        │ yes                      │
        ▼                          │
run postImplementCommand           │
post result comment                │
        │ ◄─────────────────────────┘
        ▼
repoConfig.startupCommand? ──no──► done
        │ yes
        ▼
run startupCommand (sh -c, cwd=localPath, timeout=5min)
        │
   ┌────┴────┐
  exit 0   exit ≠0 or timeout
   │          │
   ▼          ▼
post ✅     post ⚠️
comment    comment
   │          │
   └────┬─────┘
        ▼
       done
```

---

## Config JSON Schema (updated)

```json
{
  "githubToken": "string (required)",
  "githubOwner": "string (required)",
  "pollIntervalSeconds": "number (default: 30)",
  "postImplementCommand": "string (default: '')",
  "repos": [
    {
      "repo": "owner/name (required)",
      "localPath": "/abs/path (required)",
      "startupCommand": "shell command (optional)"
    }
  ]
}
```
