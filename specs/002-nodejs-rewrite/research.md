# Research: Cockpit Node.js Rewrite

**Branch**: `002-nodejs-rewrite` | **Date**: 2026-03-24

---

## Decision 1: PTY Spawning for Claude Code

**Decision**: Use `node-pty` (Microsoft, v1.1.0) to spawn Claude Code processes.

**Rationale**: Claude Code's interactive mode requires a real pseudo-terminal. `child_process.spawn` with pipes causes the process to hang or behave erratically (confirmed in upstream Claude Code issues #771 and #6295). `node-pty` is actively maintained (963 dependents, v1.1.0 released within the last 3 months), ships prebuilt binaries, and is the same library used internally by VS Code and xterm.js.

Key API:
- `pty.spawn(cmd, args, { cwd, env, cols: 200, rows: 50 })` — spawn with wide terminal to avoid line-wrapping artifacts
- `ptyProcess.onData(chunk => ...)` — streaming output; accumulate into line buffer manually
- `ptyProcess.write(text)` — inject stdin (steering/clarify relay)
- `ptyProcess.onExit(code => ...)` — exit detection
- `ptyProcess.kill('SIGTERM')` — graceful shutdown; follow with `SIGKILL` after 5s if still alive
- Timeouts implemented at application level via `setTimeout` + `kill()`

**Alternatives considered**:
- `child_process.spawn` — no true PTY, breaks Claude's interactive mode
- `child_pty` — less mature, fewer docs, smaller community

---

## Decision 2: SQLite Library

**Decision**: Use `better-sqlite3` (WiseLibs, currently v11.x).

**Rationale**: Fastest SQLite binding for Node.js (baseline vs 2.8–24x slower for alternatives), works with Node 18+, ships prebuilt binaries (no compile step), supports WAL mode natively with a one-liner, and is the de facto standard for embedded SQLite in Node.js daemons. The synchronous API is not a problem — wrapping calls in trivial Promise wrappers gives full async/await compatibility without the performance penalty of truly async bindings.

Key setup:
```js
const db = new Database(path);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
```

**Alternatives considered**:
- `node:sqlite` — experimental, Node 22.5+ only (breaks Node 18 requirement)
- `@databases/sqlite` — promise wrapper over `sqlite3`, 3–5x slower, limited maintenance
- `sqlite3` (npm) — callback API, slowest option, requires source compilation

---

## Decision 3: Daemon Process Management

**Decision**: Delegate `cockpit start/stop/restart/status` to the OS service manager (systemd on Linux, launchd on macOS). Write a PID file for fast liveness checks in `cockpit status`.

**Rationale**: `cockpit init` already writes a service definition file. Delegating to systemd/launchd gives automatic crash recovery (`Restart=on-failure`), integrated logging (`journalctl`), and zero custom signal-handling code. A PID file at `~/.cockpit/daemon.pid` provides a fast path for `cockpit status` without shelling out to `systemctl`.

Pattern:
- `cockpit start` → `systemctl --user start cockpit-daemon` (Linux) / `launchctl start com.cockpit.daemon` (macOS)
- `cockpit stop` → equivalent stop command + `rm ~/.cockpit/daemon.pid`
- `cockpit status` → read PID file + `process.kill(pid, 0)` fast path; fall back to `systemctl --user is-active`
- `cockpit restart` → `systemctl --user restart` (atomic on Linux) / stop+start on macOS

**Alternatives considered**:
- PID file only — no auto-restart, stale PIDs on crash, no log integration
- `pm2` — heavy (30+ MB), redundant (still needs systemd to supervise pm2 itself)

---

## Decision 4: GitHub API Client

**Decision**: Use `@octokit/rest` with in-memory ETag caching.

**Rationale**: Octokit provides automatic retries on transient errors, full TypeScript types, and clean pagination helpers. More importantly, ETag-based conditional requests (`If-None-Match` header) cause GitHub to return `304 Not Modified` responses that **do not consume rate limit quota**. With 30s polling across a small number of repos, raw request volume is ~480 req/hr (9.6% of the 5,000/hr quota), but ETags ensure the quota is barely touched on stable repo states.

Only 3 API endpoints needed:
1. `GET /repos/{owner}/{repo}/issues?state=open&per_page=100` — poll for `[COCKPIT]` issues
2. `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` — post stage comments
3. `GET /repos/{owner}/{repo}/issues/{issue_number}/comments` — relay clarify replies

Rate limit handling: on 429 or `x-ratelimit-remaining: 0`, parse `x-ratelimit-reset` epoch header, sleep until reset, retry.

**Alternatives considered**:
- Native `fetch` only — viable but requires manual retry logic, ETag wiring, and pagination; not worth reinventing for a 50KB dependency

---

## Decision 5: Test Framework

**Decision**: Use the built-in `node:test` runner with `node:assert`.

**Rationale**: Already used in `setup/test/setup.test.js`. No additional dependency, ships with Node 18+, supports async tests natively, and is sufficient for unit and integration tests at this project's scale.

**Alternatives considered**:
- `jest` — large dependency, slower startup, unnecessary for this scope
- `vitest` — ESM-friendly and fast, but adds a dependency when `node:test` is already available

---

## Decision 6: CLI Framework & Prompts

**Decision**: Continue using `commander` (CLI parsing) + `@clack/prompts` (TUI wizards) — already in `setup/package.json`.

**Rationale**: No reason to introduce new dependencies. The existing setup code already demonstrates the pattern works well. `commander` handles subcommands (`cockpit repos add`, `cockpit token`, etc.) cleanly.

---

## Decision 7: Project Structure

**Decision**: Single Node.js ESM package at repo root. Delete the `backend/` Python directory. Consolidate `setup/` into the main package.

Structure:
```
src/
  cli/          — commander entry point + subcommands
  daemon/       — polling loop, job runner, stage executor
  db/           — better-sqlite3 schema + query helpers
  github/       — octokit client, issue poller, comment poster
  process/      — node-pty Claude spawner
  config/       — config file read/write (~/.cockpit/config.json)
  templates/    — service file templates (systemd, launchd)
test/
  unit/
  integration/
```

**bin entry**: `cockpit` → `src/cli/index.js`
