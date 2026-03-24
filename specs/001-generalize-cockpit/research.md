# Research: Generalize Cockpit for Any Project

## 1. Redis Replacement — Embedded Storage

**Decision**: Replace Redis + `redis.asyncio` with SQLite via `aiosqlite`.

**Rationale**:
- Single dev box, one job at a time — no distribution or pub/sub needed
- SQLite provides full ACID persistence with zero external dependencies
- `aiosqlite` wraps `sqlite3` in asyncio-compatible coroutines, minimal API change
- All Redis data structures map cleanly to SQLite tables (see data-model.md)
- `BLPOP` (blocking pop) replaced by asyncio polling loop with `asyncio.sleep` — already the pattern in `_dequeue_loop`; sleep intervals of 1–2s acceptable for this use case
- Database lives at a configurable path (default `~/.cockpit/cockpit.db`); survives process restarts

**Alternatives considered**:
- **In-memory asyncio.Queue** — loses all state on restart; unacceptable
- **TinyDB (JSON files)** — no atomic transactions; concurrent log appends would corrupt state
- **LMDB** — fast but complex Python bindings; overkill for this scale
- **Plain JSON files per job** — viable but no dedup/set semantics without extra locking logic

**Implementation notes from research**:
- Enable WAL mode on startup: `PRAGMA journal_mode = WAL` — better concurrency, safe on dev box
- `dequeue()` polling: `SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1` inside a transaction, `await asyncio.sleep(0.5)` on empty; existing dequeue loop already sleeps between polls
- Log trimming: `DELETE FROM job_logs WHERE job_id=? AND seq < (SELECT MAX(seq) - 1000 FROM job_logs WHERE job_id=?)`
- Tests: use SQLite `:memory:` in conftest fixtures — drop-in replacement for Redis mock

**Migration impact**:
- `backend/services/job_store.py` — full rewrite (same public interface, SQLite internals)
- `backend/config.py` — remove `redis_url`; add `db_path: str = "~/.cockpit/cockpit.db"`
- `backend/requirements.txt` — remove `redis`; add `aiosqlite`
- `backend/main.py` — update startup to initialize SQLite tables instead of Redis connection
- `docker-compose.yml` — delete entirely
- All tests that mock Redis — rewrite against SQLite in-memory (`:memory:`) for tests

---

## 2. Node.js Interactive CLI Framework

**Decision**: `@clack/prompts` for interactive prompts + `commander` for argument/flag parsing + `chalk` for status output colors.

**Rationale**:
- `@clack/prompts` is the current modern standard for Node CLI UX (2023–2025); clean spinners, groupPrompt, cancel handling. Used by Vite, Astro, SvelteKit scaffolding tools.
- `commander` is the de facto standard for `--flag` parsing; pairs naturally with clack
- Together they handle: interactive mode (clack), `--yes` non-interactive mode (commander skips prompts), OS detection (`process.platform`), file writes (`fs/promises`)

**Setup CLI invocation pattern**:
- The CLI lives at `setup/index.js` in the cockpit repo
- `setup/package.json` declares `"type": "module"` (ESM) and a `"bin"` field pointing to `index.js`
- Users invoke it as `node setup/index.js` (or `npm run setup` from a convenience root `package.json` script)
- No npm publish required — it's a local script in the repo

**No automatic constitution invocation**:
- The setup CLI does NOT spawn `claude /speckit.constitution` — that is an interactive AI slash command, not a subprocess
- After spec-kit is installed, setup prints instructions telling the user to open their AI assistant in the target repo and run `/speckit.constitution`

**Alternatives considered**:
- **inquirer** — larger bundle, promise-based v9+ has breaking changes; clack is cleaner for new code
- **prompts** — lightweight but less maintained; no built-in cancel/abort handling
- **commander alone** — not interactive enough; clack fills the gap

---

## 3. Spec-kit Installation Mechanism

**Decision**: Install `specify-cli` as a persistent `uv` tool via `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`. The setup CLI installs the tool and prints instructions — it does NOT run `specify init` automatically.

**Rationale**:
- spec-kit is a Python CLI tool, not a git-cloneable directory structure
- `uv tool install` gives the user a persistent `specify` command on PATH, managed via `uv tool list/upgrade/uninstall`
- `specify init --here --ai claude` is the correct init command for an existing project with Claude as the AI
- The setup CLI's job is to get the tool installed; the user runs `specify init` themselves in their target repo context

**Install command** (run by setup CLI):
```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

**Post-setup instructions** (printed to user, not run automatically):
```bash
cd <your-target-repo>
specify init --here --ai claude
# Then open Claude Code and run: /speckit.constitution
```

**Spec-kit repo**: `https://github.com/github/spec-kit`

**Prerequisite**: `uv` must be on PATH. Setup CLI checks for `uv` alongside `git` and `claude`.

---

## 4. Constitution Builder

**Decision**: The setup CLI does NOT invoke `/speckit.constitution`. It prints clear next-step instructions after spec-kit is installed.

**Rationale**:
- `/speckit.constitution` is an interactive AI slash command — requires a live Claude Code session
- Cannot be meaningfully automated from a Node.js subprocess
- The correct flow: user runs setup → setup installs specify-cli → user opens Claude Code in target repo → user runs `/speckit.constitution`

---

## 5. Service File Templates

**Linux (systemd)**:
- Template: `setup/templates/cockpit-api@.service` with `{{USERNAME}}`, `{{REPO_PATH}}`, `{{ENV_FILE}}` tokens
- Setup renders template → writes to `cockpit-api@<username>.service`
- Prints: `sudo cp cockpit-api@<username>.service /etc/systemd/system/ && sudo systemctl enable --now cockpit-api@<username>`

**macOS (launchd)**:
- Template: `setup/templates/com.cockpit.api.plist` with same tokens
- Setup renders → writes to `~/Library/LaunchAgents/com.cockpit.api.plist`
- Prints: `launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist`

---

## 6. Documentation Audit Findings

Files requiring full rewrite/update:
- `CLAUDE.md` — remove Docker section, add setup CLI instructions, update architecture table
- `.env.example` — all values genericized, Tailscale noted as optional/undocumented
- `cockpit-api@.service` — templatize username, env file path
- `seamless-expo.service` — remove (project-specific, replaced by `POST_IMPLEMENT_COMMAND`)
- `README.md` — does not appear to exist; a basic one should be created as part of this feature

Tailscale: Mentioned only in `.env.example` as a documentation note ("If using Tailscale, your machine's Tailscale IP can be referenced in POST_IMPLEMENT_COMMAND"). Not a product feature.
