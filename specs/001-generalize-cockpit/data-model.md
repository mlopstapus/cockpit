# Data Model: Generalize Cockpit for Any Project

## SQLite Schema (replaces Redis)

All tables live in a single SQLite database at `DB_PATH` (default: `~/.cockpit/cockpit.db`).
Created on startup if not present; schema is idempotent (`CREATE TABLE IF NOT EXISTS`).

---

### Table: `jobs`

Stores all job state. Replaces Redis hash `job:{id}` + sorted set `jobs:history` + set `jobs:active`.

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    repo_path       TEXT NOT NULL,
    github_repo     TEXT NOT NULL,
    issue_number    INTEGER NOT NULL,
    issue_title     TEXT NOT NULL,
    issue_body      TEXT NOT NULL,
    spec_name       TEXT NOT NULL,
    stage           TEXT NOT NULL DEFAULT 'idle',
    status          TEXT NOT NULL DEFAULT 'queued',
    account_id      TEXT NOT NULL DEFAULT 'primary',
    pr_comment_id   INTEGER,
    pr_number       INTEGER,
    pr_url          TEXT,
    error           TEXT,
    created_at      TEXT NOT NULL,   -- ISO-8601
    updated_at      TEXT NOT NULL,   -- ISO-8601
    completed_at    TEXT             -- ISO-8601, nullable
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_issue  ON jobs(github_repo, issue_number);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
```

**Queue semantics**: Jobs with `status = 'queued'` are the queue. Dequeue = `SELECT ... WHERE status='queued' ORDER BY created_at LIMIT 1` inside a transaction that immediately sets `status='running'`. Replaces `BLPOP`.

---

### Table: `job_logs`

Append-only log lines per job. Replaces Redis list `job:{id}:logs`.

```sql
CREATE TABLE IF NOT EXISTS job_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id   TEXT NOT NULL REFERENCES jobs(id),
    line     TEXT NOT NULL,
    seq      INTEGER NOT NULL   -- insertion order within job
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id, seq);
```

**Buffer**: Retain last 1000 lines per job (enforced on write via `DELETE WHERE seq < (max_seq - 1000)`).

---

### Table: `seen_comments`

Dedup set for issue comments per job. Replaces Redis set `job:{id}:seen_comments`.

```sql
CREATE TABLE IF NOT EXISTS seen_comments (
    job_id      TEXT NOT NULL,
    comment_id  TEXT NOT NULL,
    PRIMARY KEY (job_id, comment_id)
);
```

---

### Table: `active_prs`

Tracked PRs for post-implement comment watching. Replaces Redis hash + set `prs:active`.

```sql
CREATE TABLE IF NOT EXISTS active_prs (
    github_repo   TEXT NOT NULL,
    pr_number     INTEGER NOT NULL,
    job_id        TEXT NOT NULL,
    issue_number  INTEGER NOT NULL,
    repo_path     TEXT NOT NULL,
    registered_at TEXT NOT NULL,   -- ISO-8601
    PRIMARY KEY (github_repo, pr_number)
);
```

---

### Table: `seen_pr_comments`

Dedup set for PR comments. Replaces Redis set `pr:{repo}:{pr_num}:seen_comments`.

```sql
CREATE TABLE IF NOT EXISTS seen_pr_comments (
    github_repo  TEXT NOT NULL,
    pr_number    INTEGER NOT NULL,
    comment_id   TEXT NOT NULL,
    PRIMARY KEY (github_repo, pr_number, comment_id)
);
```

---

### Table: `pr_review_jobs`

PR review job queue. Replaces Redis list `pr_review:queue` + hash `pr_review:{id}`.

```sql
CREATE TABLE IF NOT EXISTS pr_review_jobs (
    id            TEXT PRIMARY KEY,
    github_repo   TEXT NOT NULL,
    pr_number     INTEGER NOT NULL,
    issue_number  INTEGER NOT NULL,
    repo_path     TEXT NOT NULL,
    comment_id    TEXT NOT NULL,
    comment_body  TEXT NOT NULL,
    pr_url        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pr_review_status ON pr_review_jobs(status);
```

---

## Configuration Changes

### Removed from `config.py` / `.env`
- `REDIS_URL` — no longer needed
- `EXPO_RESTART_ENABLED` — replaced by `POST_IMPLEMENT_COMMAND`

### Added to `config.py` / `.env`
- `DB_PATH` — path to SQLite database file (default: `~/.cockpit/cockpit.db`)
- `POST_IMPLEMENT_COMMAND` — optional shell command run via `/bin/sh -c` after successful implement

### Changed defaults in `config.py`
- `github_owner` default: `""` (was `"mlopstapus"`)
- `github_repos` default: `[]` (was `["mlopstapus/seamless"]`)

---

## Setup CLI Entities

### SetupProfile (in-memory, Node.js)

Collected during interactive setup; never persisted directly — used to render output files.

```
{
  githubToken: string,
  githubOwner: string,
  githubRepos: string[],          // e.g. ["owner/repo1", "owner/repo2"]
  repoLocalPaths: Record<string, string>,  // {"owner/repo": "/abs/path"}
  targetRepoPath: string,         // primary repo path (for spec-kit install)
  postImplementCommand: string | null,
  dbPath: string,                 // default: ~/.cockpit/cockpit.db
  os: 'linux' | 'darwin',        // auto-detected from process.platform
  username: string,               // auto-detected from $USER or os.userInfo()
}
```

### Generated files from SetupProfile

| File | Template | Destination |
|------|----------|-------------|
| `.env` | `setup/templates/.env.template` | `<cockpit-repo>/.env` |
| systemd unit | `setup/templates/cockpit-api@.service.template` | `<cockpit-repo>/cockpit-api@<username>.service` |
| launchd plist | `setup/templates/com.cockpit.api.plist.template` | printed path for user to copy |
