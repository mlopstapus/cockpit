# Data Model: Cockpit Node.js Rewrite

**Branch**: `002-nodejs-rewrite` | **Date**: 2026-03-24

---

## Config (file: `~/.cockpit/config.json`, chmod 600)

Persisted on disk. Re-read by the daemon at the start of each poll cycle (no IPC required for live reload).

```json
{
  "githubToken": "ghp_...",
  "githubOwner": "your-username",
  "pollIntervalSeconds": 30,
  "postImplementCommand": "",
  "repos": [
    {
      "repo": "owner/name",
      "localPath": "/home/user/repos/name"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `githubToken` | string | yes | GitHub PAT with `repo` scope |
| `githubOwner` | string | yes | Only issues from this account are processed |
| `pollIntervalSeconds` | number | no (default 30) | Seconds between GitHub polls |
| `postImplementCommand` | string | no (default "") | Shell command run after successful implement |
| `repos` | array | yes (min 1) | Repos to watch |
| `repos[].repo` | string | yes | `owner/name` format |
| `repos[].localPath` | string | yes | Absolute path to local clone |

**Validation rules**:
- File permissions MUST be 0o600 on write
- `githubToken` MUST be non-empty
- `repos` MUST have at least one entry
- Each `localPath` is warned (not errored) if directory does not exist at config-write time

---

## SQLite Schema (`~/.cockpit/cockpit.db`, WAL mode)

### Table: `jobs`

One row per pipeline job (one GitHub issue = one job).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK | Unique job ID (random hex) |
| `github_repo` | TEXT | NOT NULL | `owner/name` |
| `issue_number` | INTEGER | NOT NULL | GitHub issue number |
| `issue_title` | TEXT | NOT NULL | Full title including `[COCKPIT]` prefix |
| `issue_body` | TEXT | | Issue body text |
| `spec_name` | TEXT | NOT NULL | Title with `[COCKPIT]` prefix stripped |
| `repo_path` | TEXT | NOT NULL | Local clone path at job-creation time |
| `stage` | TEXT | NOT NULL | Current spec-kit stage: `idle \| specify \| clarify \| plan \| tasks \| analyze \| implement \| done` |
| `status` | TEXT | NOT NULL | `queued \| active \| completed \| failed \| cancelled` |
| `error` | TEXT | | Error message if status = failed |
| `pr_url` | TEXT | | PR URL once created |
| `created_at` | TEXT | NOT NULL | ISO 8601 UTC |
| `updated_at` | TEXT | NOT NULL | ISO 8601 UTC |

**Unique constraint**: `(github_repo, issue_number)` — deduplication gate.

**State transitions**:
```
queued → active → completed
              ↘ failed
              ↘ cancelled
```

### Table: `job_logs`

Append-only log lines captured from the Claude PTY process.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `seq` | INTEGER | PK AUTOINCREMENT | Insertion order |
| `job_id` | TEXT | FK → jobs.id | Owner job |
| `line` | TEXT | NOT NULL | One line of output |

**Retention**: Trimmed to 1000 lines per job (oldest deleted when buffer exceeds limit).

### Table: `seen_comments`

Deduplication for issue comments already relayed to the running pipeline.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `job_id` | TEXT | NOT NULL | Owner job |
| `comment_id` | INTEGER | NOT NULL | GitHub comment ID |

**Unique constraint**: `(job_id, comment_id)`

### Table: `active_prs`

Tracks open PRs so their review comments can be relayed back.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `github_repo` | TEXT | NOT NULL | `owner/name` |
| `pr_number` | INTEGER | NOT NULL | GitHub PR number |
| `job_id` | TEXT | NOT NULL FK → jobs.id | Originating job |
| `issue_number` | INTEGER | NOT NULL | Source issue |
| `repo_path` | TEXT | NOT NULL | Local clone path |
| `registered_at` | TEXT | NOT NULL | ISO 8601 UTC |

**Unique constraint**: `(github_repo, pr_number)`

### Table: `seen_pr_comments`

Deduplication for PR review comments already processed.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `github_repo` | TEXT | NOT NULL | |
| `pr_number` | INTEGER | NOT NULL | |
| `comment_id` | TEXT | NOT NULL | GitHub comment node ID |

**Unique constraint**: `(github_repo, pr_number, comment_id)`

### Table: `pr_review_jobs`

Queue of PR review/steering tasks (comments on active PRs that need to be relayed).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK | Unique review job ID |
| `github_repo` | TEXT | NOT NULL | |
| `pr_number` | INTEGER | NOT NULL | |
| `issue_number` | INTEGER | NOT NULL | |
| `repo_path` | TEXT | NOT NULL | |
| `comment_id` | TEXT | NOT NULL | |
| `comment_body` | TEXT | NOT NULL | |
| `pr_url` | TEXT | NOT NULL | |
| `status` | TEXT | NOT NULL | `queued \| active \| completed \| failed` |
| `created_at` | TEXT | NOT NULL | ISO 8601 UTC |

---

## Daemon PID File (`~/.cockpit/daemon.pid`)

Single-line text file containing the running daemon's process ID. Written on daemon startup, deleted on clean shutdown. Used by `cockpit status` for a fast liveness check before falling back to `systemctl`/`launchctl`.
