# Cockpit Refactor Backlog

PR-Driven Spec Pipeline — full rewrite to align with `spec-pipeline-brief.docx`.

**The interface is GitHub.** No frontend. Developer opens `[COCKPIT] <spec-name>` PRs
in `mlopstapus/seamless` (or other configured repos). Cockpit runs spec-kit inside
that repo and posts progress back as PR comments.

See `docs/refactor-overview.md` for full architecture, migration delta, and design decisions.

## Build Order

| Epic | Title | Status | Blocks |
|------|-------|--------|--------|
| [E1](./E1-github-pr-watcher.md) | GitHub PR Watcher | Pending | E2 |
| [E2](./E2-pipeline-runner.md) | Pipeline Runner | Pending | E5 |
| [E3](./E3-websocket-streaming.md) | Log Buffer & Diagnostic Stream | Pending | — |
| [E4](./E4-pr-comment-relay.md) | PR Comment Relay (Clarify Q&A) | Pending | E2 |
| [E5](./E5-pr-status-comments.md) | PR Status Comments | Pending | E1 |
| [E6](./E6-account-rotator.md) | Account Rotator Enhancement | Pending | E2 |
| [E8](./E8-webhook-migration.md) | Webhook Migration | Pending | E1–E6 stable |

**Critical path**: E1 → E2 → E5
(Smoke test gate: `[COCKPIT]` PR opened → pipeline runs → stage comments appear on PR)

E3, E4, E6 follow in any order after E2. E8 is last.

**E7 (Expo Go App): DELETED** — GitHub mobile is the interface.

## Infrastructure Pre-work

Before any epic begins:

- [ ] Remove `postgres` service from `docker-compose.yml`
- [ ] Remove `nginx` service from `docker-compose.yml`
- [ ] Add `redis:7-alpine` service to `docker-compose.yml`
- [ ] Add `GITHUB_TOKEN`, `REDIS_URL`, `GITHUB_REPOS`, `GITHUB_OWNER` to `backend/config.py`
- [ ] Add `redis`, `httpx` to `backend/requirements.txt`
- [ ] Delete `backend/db/` directory
- [ ] Delete `frontend/` directory
