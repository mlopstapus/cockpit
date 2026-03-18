# PR-Driven Spec Pipeline — Refactor Architecture Overview

**Source**: `spec-pipeline-brief.docx`
**Date**: 2026-03-17
**Status**: Scoping

---

## The New Vision

> A PR is the spec. A PR comment is a steering command. The NUC is the build machine.

The developer authors intent entirely from their iPhone via **GitHub mobile** — no Cockpit
UI, no Expo app. Open a PR titled `[COCKPIT] <spec-name>` in the target repo
(`mlopstapus/seamless`), and Cockpit picks it up, runs the full spec-kit workflow
inside that repo, and posts progress back as PR comments.

**GitHub is the interface.**

---

## How It Works

1. Developer opens a PR in `mlopstapus/seamless` named `[COCKPIT] <spec-name>` with a
   description of what to build
2. Cockpit's GitHub watcher detects the PR
3. Cockpit `cd`s into the local `seamless` repo, spawns a Claude Code session with
   `--dangerously-skip-permissions`
4. Claude runs through spec-kit stages **using seamless's own spec-kit config and constitution**
5. During `speckit.clarify`, Claude posts questions as PR comments and waits for answers
6. Developer answers via PR comment from their phone — answers are injected into the PTY
7. When complete, Claude pushes the feature branch and updates the PR with all spec artifacts
8. Developer reviews and merges

---

## Architecture: Current vs. Target

### Trigger

| | Current | Target |
|---|---------|--------|
| **How work starts** | Developer submits textarea form in PWA | Developer opens `[COCKPIT] <spec-name>` PR in target repo |
| **Input medium** | Mobile form submission | PR title + description |
| **Steering** | Manual session interaction | PR comments (clarify Q&A + ad hoc steering) |

### Pipeline

| | Current | Target |
|---|---------|--------|
| **Execution** | Single `/new` skill command | Sequential spec-kit stages |
| **Stages** | `/new` (monolithic) | `specify → clarify → plan → tasks → analyze → implement` |
| **Feedback** | WebSocket log stream only | PR comments at each stage transition |
| **Working directory** | Cockpit's own repo | Target repo (`mlopstapus/seamless`) |
| **Constitution** | Cockpit's constitution | Target repo's own `.specify/memory/constitution.md` |

### Frontend

**None.** The current React PWA is deleted. GitHub mobile is the entire interface.
The developer uses the GitHub app on iPhone to open PRs, read stage comments,
answer clarify questions, and review spec artifacts.

### State

| | Current | Target |
|---|---------|--------|
| **Storage** | SQLite / PostgreSQL (SQLAlchemy) | Redis (job state, log buffer) |
| **Models** | Project, Session | Job (repo, PR number, stage, status, log buffer) |

### Infrastructure

| | Current | Target |
|---|---------|--------|
| **Services** | postgres, api, frontend, nginx | redis, api only |
| **Claude exec** | Host PTY in cockpit repo | Host PTY `cd`'d into target repo |
| **Developer interface** | Browser over Tailscale to PWA | GitHub mobile app |

---

## Target Repo

**`mlopstapus/seamless`** is the first repo Cockpit will work on. It is a mobile
app project — the Expo/React Native work lives there, not in Cockpit.

Cockpit is configured with a list of repos it watches. Each repo must have:
- `[COCKPIT]`-prefixed PRs to trigger the pipeline
- A local clone accessible to the NUC
- Its own `.specify/` directory with spec-kit commands and constitution

---

## Component Map: Keep / Adapt / Replace / Delete

### Keep (reuse as-is)
- `backend/services/claude_process.py` — PTY-based Claude CLI wrapper, core asset
- `backend/services/auth_process.py` — Interactive Claude login flow
- `backend/ws/hub.py` — WebSocket broadcast hub (used for log buffering + auth stream)
- `infra/Caddyfile` — TLS reverse proxy config (still needed)

### Adapt (significant changes)
- `backend/main.py` — New lifecycle (Redis, GitHub watcher, pipeline runner)
- `backend/config.py` — Add `GITHUB_TOKEN`, `REDIS_URL`, `GITHUB_REPOS`, `GITHUB_OWNER`
- `backend/services/account_rotator.py` — Add rate-limit detection from PTY output
- `backend/services/session_manager.py` — Replace with pipeline-oriented job runner
- `docker-compose.yml` — Remove postgres/nginx, add Redis

### Replace (rebuild)
- `backend/db/` → Redis job store (`backend/services/job_store.py`)
- `backend/routers/` → job-centric API (jobs, accounts, health)
- `backend/models.py` → job-centric Pydantic models

### Delete
- `frontend/` entire directory — no UI; GitHub is the interface

### New (net new code)
- `backend/services/github_watcher.py` — Poll for `[COCKPIT]` PRs in target repos
- `backend/services/pipeline_runner.py` — Sequential spec-kit stages in target repo
- `backend/services/comment_relay.py` — Post clarify questions; poll + relay answers
- `backend/services/pr_commenter.py` — Post stage transition comments to PR

---

## New Data Model (Redis)

```
job:{id}
  repo_path:     string   — local path to the target repo (e.g. ~/repos/seamless)
  github_repo:   string   — owner/repo (e.g. "mlopstapus/seamless")
  pr_number:     int      — GitHub PR number
  pr_title:      string   — PR title (e.g. "[COCKPIT] add user auth flow")
  pr_body:       string   — PR description (the feature intent)
  branch:        string   — branch name (derived from PR title)
  stage:         enum     — idle | specify | clarify | plan | tasks | analyze | implement | done | failed
  status:        enum     — queued | running | awaiting_clarification | paused | completed | failed
  account_id:    string   — active Claude profile
  log_buffer:    list     — last N lines of PTY output (LPUSH/LTRIM)
  created_at:    timestamp
  updated_at:    timestamp

jobs:queue        — Redis list (RPUSH enqueue, BLPOP dequeue)
jobs:active       — Redis set (currently running job IDs)
jobs:history      — Redis sorted set (completed jobs by timestamp)
```

---

## New API Surface

### REST
```
GET  /api/jobs               — list jobs (active + recent)
GET  /api/jobs/{id}          — job detail + current stage
POST /api/jobs/{id}/pause    — pause active job
POST /api/jobs/{id}/resume   — resume paused job
POST /api/jobs/{id}/cancel   — cancel job
GET  /api/accounts           — account status + rate limit state
POST /api/accounts/{id}/auth — trigger re-auth (WebSocket stream)
GET  /api/health             — system status
```

### WebSocket
```
WS /ws/jobs/{id}             — PTY output stream (for internal monitoring / debugging)
WS /ws/accounts/{id}/auth    — interactive login stream (reuse existing)
```

---

## Pipeline Stages (Sequential)

```
PR opened: [COCKPIT] <spec-name> in mlopstapus/seamless
  │
  ▼ Cockpit detects PR, enqueues job
  │ cd ~/repos/seamless
  │ claude --dangerously-skip-permissions
  │
  ▼
[1] SPECIFY     /speckit.specify    — generate spec.md from PR title + body
  │
  ▼
[2] CLARIFY     /speckit.clarify    — identify ambiguities; post questions as PR comments
  │               wait for developer to answer via PR comment
  │               inject answers into PTY; Claude continues
  ▼
[3] PLAN        /speckit.plan       — build technical implementation plan
  │
  ▼
[4] TASKS       /speckit.tasks      — break plan into ordered, dependency-aware tasks
  │
  ▼
[5] ANALYZE     /speckit.analyze    — cross-artifact consistency check
  │
  ▼
[6] IMPLEMENT   /speckit.implement  — execute all tasks
  │
  ▼
Feature branch pushed, spec artifacts committed, PR updated
Developer reviews spec artifacts + implementation, merges when satisfied
```

PR comment posted at each stage start and completion.
The target repo's `.specify/memory/constitution.md` governs all stages —
Cockpit's own constitution is not referenced during pipeline execution.

---

## Clarify Stage: Interactive Q&A Flow

The clarify stage is the only blocking, interactive stage:

1. Claude runs `/speckit.clarify` → outputs up to 5 targeted questions
2. Pipeline runner detects question output (sentinel pattern in PTY stream)
3. `comment_relay` posts questions as a single PR comment (numbered list)
4. Job status set to `awaiting_clarification`
5. `comment_relay` polls PR for developer's reply comment
6. When answer comment detected from repo owner:
   - Injected into active PTY session
   - Job status returns to `running`
   - Claude continues with clarified context
7. If no answer within configurable timeout (default: 24h) → proceed with assumptions

---

## Security Considerations

Per constitution Principle III (Security First):

- `GITHUB_TOKEN` stored as environment variable, never logged
- PTY output scrubbed of secrets before posting to PR comments
- Only PR comments from the repo owner (`GITHUB_OWNER`) are relayed back
- Redis not exposed outside Docker network
- Tailscale ACL governs all NUC access
- Account profile directories mounted read-only in Docker
- `--dangerously-skip-permissions` scoped to target repo working directory only

---

## Build Order

1. **E1: GitHub PR Watcher** — poll `[COCKPIT]` PRs in configured repos
2. **E2: Pipeline Runner** — spec-kit stages in target repo via PTY
3. **E3: WebSocket / Log Buffer** — internal log persistence + diagnostic stream
4. **E4: PR Comment Relay** — clarify Q&A + ad hoc steering via PR comments
5. **E5: PR Status Comments** — stage transitions posted to PR
6. **E6: Account Rotator Enhancement** — rate limit detection + graceful resume
7. **E8: Webhook Migration** — replace polling with webhooks via Tailscale Funnel

E1 → E2 → E5 is the critical path (smoke test: PR → pipeline runs → comments posted).
E3 and E4 follow. E6 can run in parallel with E4/E5. E8 is last.

No Expo app. No frontend. No E7.

---

## What This Is Not

- Not a DAG executor — sequential spec-kit stages only
- Not a general CI system — purpose-built for `[COCKPIT]` PR workflow
- Not autonomous merge — human reviews and merges PR
- Not a Cockpit UI system — GitHub mobile is the entire developer interface
- Not running spec-kit in Cockpit's own repo — always operates in the target repo
