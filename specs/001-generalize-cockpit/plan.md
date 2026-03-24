# Implementation Plan: Generalize Cockpit for Any Project

**Branch**: `001-generalize-cockpit` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-generalize-cockpit/spec.md`

## Summary

Make Cockpit usable by any developer for any project. This involves five parallel tracks:
(1) a Node.js setup CLI that bootstraps config, service files, spec-kit, and a project constitution;
(2) replacing Redis/Docker with an embedded SQLite store;
(3) replacing hardcoded Expo restart with a generic `POST_IMPLEMENT_COMMAND` hook;
(4) purging all hardcoded project-specific references from source and config;
(5) rewriting all outdated documentation to reflect the new setup flow.

## Technical Context

**Language/Version**: Python 3.11+ (backend), Node.js 18+ (setup CLI)
**Primary Dependencies**: FastAPI, aiosqlite (backend); @clack/prompts, commander, chalk (setup CLI)
**Storage**: SQLite via aiosqlite — single file at `~/.cockpit/cockpit.db`; no external services
**Testing**: pytest + aiosqlite in-memory `:memory:` DB (backend); node:test or vitest (setup CLI)
**Target Platform**: Linux + macOS (dev box, bare metal/VM, host OS only)
**Project Type**: Background service (FastAPI) + interactive CLI tool (Node.js)
**Performance Goals**: Sub-second job dequeue; hook execution within 30s timeout
**Constraints**: Zero external services (no Docker, Redis, or daemons beyond the cockpit process itself)
**Scale/Scope**: Single dev box, one job at a time, ~50 job history retained

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | Will all agent actions be scoped to a feature branch and logged? Is any project-specific behaviour expressed via config, not source code? | ✅ Yes — all project-specific behaviour (hook cmd, repo paths, service names) is config-driven; hardcoded refs are being purged |
| II. Thorough Change Review | Will this feature be delivered as a PR with session logs available for review? | ✅ Yes |
| III. Security First | Have all external inputs been identified and sanitised? Are secrets stored in GitHub or injected via env vars (not in source)? Is VPN/private network access enforced? | ✅ GitHub issue input is already sanitised; secrets via .env only; VPN is optional/documented, not enforced by product |
| IV. Test-Driven Implementation | Are tests planned alongside (or before) implementation for all critical paths? | ✅ Yes — tests planned for JobStore rewrite, hook execution, and setup CLI |
| V. Dev Box Execution Model | Does this feature assume host-OS execution (no containerised agents)? Are post-implement hooks expressed as configurable shell commands? | ✅ Docker removed entirely; hooks are `POST_IMPLEMENT_COMMAND` shell strings |
| VI. Continuous Self-Improvement | Are memory updates, template improvements, and backlog entries planned for session close? | ✅ Planned at finish — CLAUDE.md rewrite counts as documentation self-improvement |

## Project Structure

### Documentation (this feature)

```text
specs/001-generalize-cockpit/
├── plan.md              # This file
├── research.md          # Technology decisions
├── data-model.md        # SQLite schema + config changes
├── quickstart.md        # Validation checklist
├── contracts/
│   ├── setup-cli.md     # CLI interface contract
│   └── post-implement-hook.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code Changes

```text
# New: Setup CLI
setup/
├── index.js                          # Entry point (ESM, Node 18+)
├── package.json                      # { "type": "module", "bin": {...} }
├── prompts.js                        # @clack/prompts interaction logic
├── render.js                         # Template rendering (tokens → values)
└── templates/
    ├── .env.template
    ├── cockpit-api@.service.template  # systemd (Linux)
    └── com.cockpit.api.plist.template # launchd (macOS)

# Modified: Backend
backend/
├── config.py                         # Remove redis_url, expo_restart_enabled
│                                     # Add db_path, post_implement_command
├── main.py                           # Init SQLite on startup
├── requirements.txt                  # Remove redis; add aiosqlite
├── services/
│   ├── job_store.py                  # Full rewrite: Redis → SQLite
│   └── pipeline_runner.py            # Replace _restart_expo() with PostImplementHook
└── tests/
    └── test_job_store.py             # Rewrite against aiosqlite :memory:

# Modified/Removed: Root files
.env.example                          # Full rewrite — generic placeholders
CLAUDE.md                             # Full rewrite — remove Docker, add setup CLI
docker-compose.yml                    # DELETE
cockpit-api@.service                  # Templatize (or move to setup/templates/)
seamless-expo.service                 # DELETE (project-specific)
README.md                             # CREATE (currently missing)
```

## Complexity Tracking

> No constitution violations. No entries required.

---

## Phase 0: Research (Complete)

See `research.md`. All NEEDS CLARIFICATION resolved:
- Storage: SQLite via aiosqlite ✅
- CLI framework: @clack/prompts + commander ✅
- Spec-kit install: `git clone --depth 1` ✅
- Constitution builder: spawn `claude /speckit.constitution` ✅
- Service templates: systemd (Linux) + launchd (macOS) ✅

---

## Phase 1: Design (Complete)

See `data-model.md`, `contracts/`, `quickstart.md`.

Key design decisions:
- `JobStore` public interface remains identical — callers unchanged; only internals swap Redis → SQLite
- `dequeue()` replaces `BLPOP` with a SELECT + UPDATE transaction; asyncio polling loop already exists
- `POST_IMPLEMENT_COMMAND` is a single env var; `_restart_expo()` and `EXPO_RESTART_ENABLED` removed
- Setup CLI is pure Node.js ESM, no build step, invoked as `node setup/index.js`
- Setup CLI installs `specify-cli` via `uv tool install`; does NOT invoke `/speckit.constitution` automatically — prints next-step instructions instead

---

## Implementation Notes for Tasks Phase

### JobStore migration strategy
Replace `redis.asyncio` calls one method at a time. The public API (`enqueue`, `dequeue`, `get`, `update`, `mark_*`, `append_log`, etc.) stays identical — callers in `pipeline_runner.py`, `github_watcher.py`, `comment_relay.py` do not change.

Dequeue polling: the existing `_dequeue_loop` in `pipeline_runner.py` already sleeps between polls. Replace `blpop(timeout=5)` with a `SELECT + UPDATE` transaction that returns the oldest queued job, with `await asyncio.sleep(2)` on empty result.

### Setup CLI phases (sequential)
1. Parse flags (commander)
2. Phase 1: Prompt for Cockpit config → write `.env`
3. Phase 2: Detect OS → render + write service file → print instructions
4. Phase 3: Prompt for spec-kit install → `uv tool install specify-cli`
5. Phase 4: `printNextSteps()` — print `specify init --here --ai claude` and `/speckit.constitution` instructions; no subprocess

### Documentation update scope
- `CLAUDE.md`: Remove entire Docker/docker-compose section; update "Running" to reference `node setup/index.js`; update architecture table (remove Redis); update system tools table
- `.env.example`: Genericize all values; add `DB_PATH` and `POST_IMPLEMENT_COMMAND`; remove `EXPO_RESTART_ENABLED`
- `README.md`: Create with project overview, one-line install, link to CLAUDE.md for details
- Delete `docker-compose.yml` and `seamless-expo.service`
