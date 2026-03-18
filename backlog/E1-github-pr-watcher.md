# E1: GitHub PR Watcher

**Status**: Pending
**Blocks**: E2 (Pipeline Runner)
**Estimated scope**: New service (~150 LOC) + config + tests

---

## Goal

Poll GitHub for new PRs titled `[COCKPIT] <spec-name>` across configured repos.
Enqueue a job to Redis for each newly detected PR. Skip PRs already in the queue
or active.

---

## PR Convention

- **Title format**: `[COCKPIT] <spec-name>` (e.g. `[COCKPIT] add user auth flow`)
- **Branch**: the existing PR branch (developer creates it on GitHub mobile)
- **Repo**: configured per instance, initial target is `mlopstapus/seamless`
- **Body**: free-form description of the feature — this becomes the spec input

Detection filter: PR title starts with `[COCKPIT]` (case-sensitive, square brackets
required to avoid accidental matches).

---

## What Exists

Nothing directly reusable. Net new service.

---

## Files to Create

### `backend/services/github_watcher.py`

```
GithubWatcher
  - poll_interval: int (seconds, from config)
  - repos: list[str]  (owner/repo pairs, from config GITHUB_REPOS)
  - github_token: str (from config, never logged)
  - github_owner: str (from config GITHUB_OWNER — only this user's PRs processed)
  - redis: Redis client

  async start() → background task
  async stop()
  async _poll_once() → for each repo, fetch open PRs, filter [COCKPIT] prefix
  async _is_already_known(pr_key: str) → bool
  async _enqueue_job(pr: dict) → creates job:{id} in Redis + RPUSH to jobs:queue
  def _extract_spec_name(title: str) → str  # strips "[COCKPIT] " prefix
```

### `backend/services/job_store.py`

Single Redis abstraction. All services use this — no raw Redis calls elsewhere.

```
JobStore
  async enqueue(job: Job) → str           # job id; deduplicates by pr_key
  async dequeue() → Job | None            # BLPOP with timeout
  async get(job_id: str) → Job | None
  async update(job_id: str, **fields)
  async append_log(job_id: str, line: str)
  async get_log_tail(job_id: str, n: int) → list[str]
  async list_active() → list[Job]
  async list_recent(limit: int) → list[Job]
  async mark_active(job_id: str)
  async mark_complete(job_id: str)
  async mark_failed(job_id: str, reason: str)
```

---

## Files to Modify

### `backend/config.py`

```python
github_token: str               = Field(...,          env="GITHUB_TOKEN")
github_owner: str               = Field(...,          env="GITHUB_OWNER")
  # only PRs opened by this GitHub user are processed (e.g. "mlopstapus")
github_repos: list[str]         = Field(...,          env="GITHUB_REPOS")
  # comma-separated "owner/repo", e.g. "mlopstapus/seamless"
github_poll_interval: int       = Field(default=30,   env="GITHUB_POLL_INTERVAL")
redis_url: str                  = Field(default="redis://redis:6379", env="REDIS_URL")
repo_local_paths: dict[str,str] = Field(default_factory=dict, env="REPO_LOCAL_PATHS")
  # maps "owner/repo" → local path, e.g. {"mlopstapus/seamless": "/home/ben/repos/seamless"}
```

### `backend/main.py`

Start `GithubWatcher` and `JobStore` in `startup` lifespan handler.

### `docker-compose.yml`

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    retries: 5
```

---

## Security

- `GITHUB_TOKEN` loaded from env, never interpolated into log strings
- `GITHUB_OWNER` filter: only the configured owner's PRs enqueued (not all contributors)
- `[COCKPIT]` prefix filter prevents accidental triggers from normal PRs
- `repo_local_paths` maps must be explicitly configured — no auto-discovery
- GitHub API calls via `httpx` with explicit 10s timeout

---

## Tests

`backend/tests/test_github_watcher.py`

- [ ] `test_cockpit_prefix_pr_enqueued` — `[COCKPIT] add auth` PR → job created in Redis
- [ ] `test_non_cockpit_prefix_ignored` — PR titled `add auth` (no prefix) not enqueued
- [ ] `test_wrong_owner_ignored` — PR from a non-owner GitHub user not enqueued
- [ ] `test_already_queued_pr_skipped` — second poll does not create a duplicate job
- [ ] `test_closed_pr_not_enqueued` — closed/merged PRs ignored
- [ ] `test_spec_name_extracted_correctly` — `[COCKPIT] add sms` → spec_name = `add sms`
- [ ] `test_job_store_enqueue_dequeue` — round-trip enqueue/dequeue returns correct job
- [ ] `test_job_store_append_log` — log lines stored and retrievable via get_log_tail
- [ ] `test_github_token_absent_from_logs` — assert token absent in caplog output

Use `pytest-asyncio`, `fakeredis`, `respx` for GitHub API mocking.

---

## Definition of Done

- [ ] `GithubWatcher` polls every `GITHUB_POLL_INTERVAL` seconds as a background task
- [ ] `[COCKPIT]`-prefixed PR from configured owner → job in Redis within one poll cycle
- [ ] Already-queued PRs silently deduplicated
- [ ] `JobStore` is the single Redis interface (no raw Redis elsewhere)
- [ ] All tests pass
- [ ] `GITHUB_TOKEN` absent from all log output
