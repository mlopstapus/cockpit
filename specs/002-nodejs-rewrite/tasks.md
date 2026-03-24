# Tasks: Cockpit Node.js Rewrite

**Input**: Design documents from `/specs/002-nodejs-rewrite/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/cli-commands.md ✅, quickstart.md ✅

**Tests**: Per the project constitution (Principle IV: Test-Driven Implementation), tests are MANDATORY — every feature MUST include tests written before or alongside implementation. Tests MUST pass before the agent creates a PR.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Promote the repo to a single-package Node.js ESM project; establish native module build verification.

- [X] T001 Create root `package.json` with `"type": "module"`, `bin: { "cockpit": "src/cli/index.js" }`, `engines: { node: ">=18.0.0" }`, and all runtime dependencies: `commander@^12`, `@clack/prompts@^0.7`, `chalk@^5`, `better-sqlite3@^11`, `node-pty@^1.1`, `@octokit/rest@^21`; devDeps: `@types/better-sqlite3`, `node-gyp`
- [X] T002 [P] Create `src/` directory tree with placeholder `index.js` files: `src/cli/`, `src/daemon/`, `src/db/`, `src/github/`, `src/process/`, `src/config/`, `src/templates/`
- [X] T003 [P] Create `test/` directory tree: `test/unit/` and `test/integration/` with `.gitkeep` files
- [X] T004 [P] Create `.eslintrc.json` for ESM Node.js 18+: `"sourceType": "module"`, `"env": { "node": true, "es2022": true }`, no-unused-vars, no-undef rules
- [X] T005 Add `"build": "node --input-type=commonjs -e \"require('better-sqlite3'); require('node-pty')\""` verify script to `package.json` scripts and confirm native modules install cleanly via `npm install` (use `--input-type=commonjs` because the package is ESM but native module verification needs CJS `require()`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: SQLite schema + config I/O — MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational Layer (MANDATORY — constitution Principle IV)

> **NOTE: Write these tests FIRST so they FAIL before implementation**

- [X] T006 [P] Write unit tests for DB schema init in `test/unit/db.test.js`: verify all 6 tables exist (`jobs`, `job_logs`, `seen_comments`, `active_prs`, `seen_pr_comments`, `pr_review_jobs`), WAL mode enabled, foreign keys on; use `:memory:` DB
- [X] T007 [P] Write unit tests for job CRUD in `test/unit/db.test.js`: enqueue+dequeue roundtrip, FIFO order, dedup on `(github_repo, issue_number)`, `mark_active`/`mark_complete`/`mark_failed`/`mark_cancelled`, `list_active`, `list_recent`
- [X] T008 [P] Write unit tests for log module in `test/unit/db.test.js`: `append_log` stores lines, `get_log_tail` returns correct order, 1000-line buffer cap trims oldest lines
- [X] T009 [P] Write unit tests for dedup modules in `test/unit/db.test.js`: `is_comment_seen`/`mark_comment_seen`, `register_active_pr`/`get_active_pr`/`deregister_pr`, `is_pr_comment_seen`/`mark_pr_comment_seen`, `enqueue_pr_review`/`dequeue_pr_review`
- [X] T010 [P] Write unit tests for config module in `test/unit/config.test.js`: `readConfig` roundtrip, `writeConfig` creates file with mode `0o600`, `validateConfig` errors on missing `githubToken` or empty `repos`, default `pollIntervalSeconds=30`

### Foundational Implementation

- [X] T011 Implement SQLite schema init in `src/db/index.js`: open DB at path, `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`, `PRAGMA foreign_keys=ON`; CREATE TABLE IF NOT EXISTS for all 6 tables per `data-model.md`; export `openDb(path)` function
- [X] T012 [P] Implement job CRUD in `src/db/jobs.js`: `enqueueJob(db, job)` with `INSERT OR IGNORE` + return existing id on conflict; `dequeueJob(db)` selects oldest queued then updates to active in a transaction; `markActive/Complete/Failed/Cancelled(db, id)`; `getJob(db, id)`; `listActive(db)`; `listRecent(db, n=20)`; `makeJobId()` returns 8-char hex
- [X] T013 [P] Implement log append/trim in `src/db/logs.js`: `appendLog(db, jobId, line)` inserts line then deletes rows where `seq < (maxSeq - 999)`; `getLogTail(db, jobId, n=50)` fetches last n rows ordered ascending
- [X] T014 [P] Implement comment dedup in `src/db/comments.js`: `isCommentSeen(db, jobId, commentId)`, `markCommentSeen(db, jobId, commentId)` with `INSERT OR IGNORE`
- [X] T015 [P] Implement active PR tracking in `src/db/prs.js`: `registerActivePr(db, pr)`, `listActivePrs(db)`, `getActivePr(db, repo, prNumber)`, `deregisterPr(db, repo, prNumber)`, `isPrCommentSeen(db, repo, prNumber, commentId)`, `markPrCommentSeen(db, repo, prNumber, commentId)`
- [X] T016 [P] Implement PR review queue in `src/db/pr-reviews.js`: `enqueuePrReview(db, review)`, `dequeuePrReview(db)` selects oldest queued + marks active in transaction
- [X] T017 Implement config read/write in `src/config/index.js`: `readConfig(dir='~/.cockpit')` parses `config.json`; `writeConfig(dir, config)` serialises and calls `fs.chmod(path, 0o600)`; `validateConfig(config)` throws on missing required fields; `expandHome(p)` replaces `~` with `os.homedir()`

**Checkpoint**: DB and config modules fully tested — user story implementation can now begin.

---

## Phase 3: User Story 1 — First-Time Setup (Priority: P1) 🎯 MVP

**Goal**: `cockpit init` walks a new user through the TUI wizard, writes config + service file, and leaves the daemon ready to start.

**Independent Test**: Run `cockpit init --yes` with env vars set → verify `~/.cockpit/config.json` exists with mode 600, service file written to correct OS location, no crash.

### Tests for User Story 1 (MANDATORY — constitution Principle IV)

- [X] T018 [P] [US1] Write unit tests for init prerequisite checker in `test/unit/init.test.js`: missing `git` exits code 2, missing `claude` exits code 2, both present continues, missing `uv` emits warning but continues
- [X] T019 [P] [US1] Write unit tests for `--yes` mode in `test/unit/init.test.js`: all 6 env vars read correctly, missing `GITHUB_TOKEN` exits with error, multiple repos parsed from comma-separated `GITHUB_REPOS` and JSON `REPO_LOCAL_PATHS`
- [X] T020 [P] [US1] Write unit tests for service file writer in `test/unit/init.test.js`: Linux path goes to `~/.config/systemd/user/`, macOS path goes to `~/Library/LaunchAgents/`, tokens replaced correctly in templates

### Implementation for User Story 1

- [X] T021 [US1] Create systemd service file template `src/templates/cockpit-daemon.service.template` with `{{USERNAME}}`, `{{COCKPIT_DIR}}`, `{{NODE_PATH}}` tokens; `Restart=on-failure`, `RestartSec=5`, `StandardOutput=journal`
- [X] T022 [US1] Create launchd plist template `src/templates/com.cockpit.daemon.plist.template` with `{{HOME}}`, `{{COCKPIT_DIR}}`, `{{NODE_PATH}}` tokens; `RunAtLoad=true`, stdout/stderr log paths
- [X] T023 [US1] Implement prerequisite checker in `src/cli/init.js`: `checkPrereqs()` uses `which git` / `which claude` via `child_process.execSync`; exits process with code 2 and clear message if either missing; warns (not exits) if `uv` missing
- [X] T024 [US1] Implement `--yes` non-interactive mode in `src/cli/init.js`: read `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPOS` (comma-separated), `REPO_LOCAL_PATHS` (JSON map), `POLL_INTERVAL` (default 30), `POST_IMPLEMENT_COMMAND` (default ""); validate and return config object
- [X] T025 [US1] Implement interactive TUI config collection in `src/cli/init.js` using `@clack/prompts`: masked token input, owner text input, looping repo-add prompt (owner/name + local path with existence warning), existing config detection with update/cancel choice
- [X] T026 [US1] Implement service file writer in `src/cli/init.js`: detect `process.platform`; replace `{{USERNAME}}`, `{{COCKPIT_DIR}}`, `{{NODE_PATH}}` (Linux) and `{{HOME}}`, `{{COCKPIT_DIR}}`, `{{NODE_PATH}}` (macOS) placeholders using regex; write systemd unit to `~/.config/systemd/user/cockpit-daemon.service` (Linux) or launchd plist to `~/Library/LaunchAgents/com.cockpit.daemon.plist` (macOS); on Linux run `systemctl --user daemon-reload && systemctl --user enable --now cockpit-daemon` (the `--now` flag both enables and starts the service); on macOS run `launchctl load ~/Library/LaunchAgents/com.cockpit.daemon.plist`
- [X] T027 [US1] Implement specify-cli installation step in `src/cli/init.js`: `spawnSync('uv', ['tool', 'install', 'specify-cli', '--quiet'])` if uv available; non-fatal on failure; print manual install instructions if uv missing
- [X] T028 [US1] Implement next-steps printer in `src/cli/init.js`: print `cockpit start`, `cockpit status`, `specify init --here --ai claude`, `/speckit.constitution` hint, example `[COCKPIT]` issue title
- [X] T029 [US1] Register `cockpit init` command in `src/cli/index.js`: commander root program, `--yes` flag, `--target <dir>` flag; wire to `src/cli/init.js`

**Checkpoint**: `cockpit init --yes` fully functional — config + service file written, spec-kit installed.

---

## Phase 4: User Story 2 — Automated Issue-to-PR Pipeline (Priority: P1)

**Goal**: The daemon detects `[COCKPIT]` issues, runs the full pipeline, posts stage comments, and links the PR.

**Independent Test**: With daemon running and a watched repo configured, open `[COCKPIT] test` issue → verify acknowledgement comment within 60s, stage comments appear, PR linked on completion.

### Tests for User Story 2 (MANDATORY — constitution Principle IV)

- [X] T030 [P] [US2] Write unit tests for GitHub watcher in `test/unit/watcher.test.js`: `[COCKPIT]` prefix enqueued, non-prefix skipped, wrong owner skipped, PR-type item skipped, 304 response returns cached issues, 429 throws RateLimitError with correct wait ms, repo entry with empty/missing `localPath` is skipped with a warning log and no job enqueued
- [X] T031 [P] [US2] Write unit tests for GitHub commenter in `test/unit/commenter.test.js`: `postComment` calls correct endpoint, `listCommentsSince` filters by timestamp, PR comment relay functions call correct endpoints
- [X] T032 [P] [US2] Write unit tests for Claude process spawner in `test/unit/claude-process.test.js`: output line buffering accumulates partial chunks, `write()` injects text to stdin, timeout kills SIGTERM then SIGKILL after 5s, `onExit` fires with exit code, stage sentinel detected in output
- [X] T033 [P] [US2] Write unit tests for stage executor in `test/unit/stage-executor.test.js`: each stage posts a comment, clarify relay picks up comments and injects them, failed Claude exit marks job failed + posts error comment, `appendLog` lines are redacted of GitHub token value (token replaced with `[REDACTED]`)
- [X] T043 [P] [US2] Write integration test for full job lifecycle in `test/integration/pipeline.test.js`: (a) **happy path** — mock Octokit returns one `[COCKPIT]` issue, mock PTY emits all 6 sentinel lines then exits 0; assert job transitions queued→active→completed, 8+ comments posted (picked-up + 6 stages + PR link); (b) **failure path** — mock PTY exits non-zero; assert job transitions queued→active→failed, error comment posted, a second queued job is subsequently dequeued and started

### Implementation for User Story 2

- [X] T034 [US2] Implement Octokit client factory with ETag cache in `src/github/client.js`: `createClient(token)` returns Octokit instance with `hook.before` adding `If-None-Match` from in-memory Map and `hook.after` storing ETag; `RateLimitError` class with `waitMs` field
- [X] T035 [US2] Implement GitHub issue watcher in `src/github/watcher.js`: `pollRepo(octokit, db, repo, localPath, owner)` — if `localPath` is falsy emit a warning log and return immediately (skip with no job enqueued); otherwise fetches open issues, filters title prefix `[COCKPIT]` + `user.login === owner`, skips items with `pull_request` key, sanitises `issue.title` and `issue.body` by stripping control characters (`/[\x00-\x1F\x7F]/g` excluding `\n`) before calling `enqueueJob`; handles 429 by throwing `RateLimitError`
- [X] T036 [US2] Implement GitHub commenter in `src/github/commenter.js`: `postIssueComment(octokit, repo, issueNumber, body)`, `listIssueComments(octokit, repo, issueNumber, since)`, `postPRComment(octokit, repo, prNumber, body)`, `listPRComments(octokit, repo, prNumber, since)`
- [X] T037 [US2] Implement Claude PTY spawner in `src/process/claude-process.js`: `spawnClaude(repoPath, configDir, extraArgs, opts)` using `node-pty` with `cols:200, rows:50`; `onData` line buffer with `\n` split; `write(text)` for stdin; `onExit(cb)` handler; `kill()` sends SIGTERM then SIGKILL after 5s; `setTimeout`-based timeout fires kill sequence
- [X] T038 [US2] Implement stage sentinel detection in `src/process/claude-process.js`: `detectSentinel(line)` returns matching stage name or null; sentinels map: `specify`→`['spec.md written','specification complete']`, `clarify`→`['no clarification needed','clarifications recorded']`, `plan`→`['plan.md written','plan complete']`, `tasks`→`['tasks.md written']`, `analyze`→`['analysis complete','no critical']`, `implement`→`['pr created','pull request','github.com/.*pull']`; also detect `PR_URL` via regex and rate-limit signals
- [X] T039 [US2] Implement daemon entry point in `src/daemon/index.js`: `start()` opens DB, performs crash recovery (query jobs with `status='active'` and update them to `status='failed'`, `error='daemon restarted while job was active'`), writes PID to `~/.cockpit/daemon.pid`; registers `SIGTERM` handler that removes PID + sets shutdown flag; validates config exists and is valid (exit code 1 if not); calls `startPollLoop()`. Add unit test in `test/unit/daemon.test.js`: verify any `active` jobs at startup are transitioned to `failed` before polling begins.
- [X] T040 [US2] Implement poll loop with hot config reload in `src/daemon/poller.js`: `startPollLoop(db)` (receives already-opened DB from T039); loops on `!shuttingDown`; re-reads config at top of each cycle; for each repo entry, skip and log a warning if `localPath` is falsy; calls `pollRepo` for each valid repo; calls `runNextJob` after polling; handles `RateLimitError` by sleeping to reset time; sleeps `pollIntervalSeconds` between cycles
- [X] T041 [US2] Implement job runner in `src/daemon/job-runner.js`: `runNextJob(db, octokit, config)` dequeues one job, marks active, calls `executeJob(db, job, octokit, config)` (4 args — pass `octokit` instance from poller context), marks complete or failed, appends all Claude output lines to job log via `appendLog(db, job.id, redactSecrets(line, config.githubToken))` where `redactSecrets(line, token)` replaces occurrences of the token value with `[REDACTED]`
- [X] T042 [US2] Implement stage executor in `src/daemon/stage-executor.js`: `executeJob(db, job, octokit, config)` posts "picked up" comment; spawns Claude with spec-kit args; on each sentinel detected posts stage-complete comment; during clarify: polls issue comments with `listIssueComments`, deduplicates via `seen_comments`, injects new replies via `write()`; on PR URL detected registers active PR and posts final link comment; on Claude exit non-zero marks failed + posts error comment

**Checkpoint**: Full daemon pipeline functional — issue detected, pipeline runs, PR linked in issue comment.

---

## Phase 5: User Story 3 — Runtime Management CLI (Priority: P2)

**Goal**: `cockpit status/logs/repos/token/stop/restart` all work correctly against a running daemon.

**Independent Test**: Start daemon, run `cockpit status` → shows running; `cockpit repos add` → next poll includes new repo; `cockpit stop` → daemon stops.

### Tests for User Story 3 (MANDATORY — constitution Principle IV)

- [X] T044 [P] [US3] Write unit tests for daemon-control commands in `test/unit/daemon-control.test.js`: `start` shells correct OS command (Linux: `systemctl --user start`, macOS: `launchctl start`), `stop` removes PID file, `status` reads PID file and calls `process.kill(pid,0)`, falls back to `systemctl --user is-active`
- [X] T045 [P] [US3] Write unit tests for logs command in `test/unit/logs.test.js`: default 50-line tail from DB, `-n` override, job-id fetches `getLogTail` for that job, job not found exits code 1
- [X] T046 [P] [US3] Write unit tests for repos commands in `test/unit/repos.test.js`: `add` with valid format updates config, `add` with missing path emits warning and continues, `remove` non-existent repo exits code 1, `list` shows `[exists]`/`[missing]` annotation

### Implementation for User Story 3

- [X] T047 [US3] Implement `cockpit start/stop/restart` in `src/cli/daemon-control.js`: platform-detect `process.platform`; Linux: `execSync('systemctl --user start|stop|restart cockpit-daemon')`; macOS: `execSync('launchctl start|stop com.cockpit.daemon')` (stop+sleep 1s+start for restart); print confirmation or error
- [X] T048 [US3] Implement `cockpit status` display in `src/cli/daemon-control.js`: read `~/.cockpit/daemon.pid`; test with `process.kill(pid, 0)`; if alive query DB for active job (id, stage, elapsed); query config for watched repos; print formatted status block per `contracts/cli-commands.md`; fallback to `systemctl --user is-active` if PID file missing
- [X] T049 [US3] Implement `cockpit logs [job-id]` in `src/cli/logs.js`: without job-id read last `-n` (default 50) lines from daemon system logs via `journalctl --user -u cockpit-daemon -n N --no-pager` (Linux) or log file tail (macOS); with job-id call `getLogTail(db, jobId, n)` and print; `-f` flag: `setInterval` poll DB every 1s and print new lines
- [X] T050 [US3] Implement `cockpit repos list/add/remove` in `src/cli/repos.js`: `list` reads config and prints each repo with `fs.existsSync(localPath)` annotation; `add` validates `owner/name` regex, warns if path missing, reads+modifies+writes config; `remove` errors if repo not in config; all three write config with `writeConfig`
- [X] T051 [US3] Implement `cockpit token` in `src/cli/token.js`: `@clack/prompts` password prompt; write new token to config with `writeConfig` (preserves chmod 600); print confirmation with next-poll-cycle note
- [X] T052 [US3] Register all management subcommands in `src/cli/index.js`: `daemon` (internal, calls daemon entry), `start`, `stop`, `restart`, `status`, `logs` (with `-n` and `-f` flags, optional job-id arg), `repos` (subcommand with list/add/remove), `token`; all flags per `contracts/cli-commands.md`

**Checkpoint**: All CLI management commands functional and tested.

---

## Phase 6: User Story 4 — Post-Implement Hook (Priority: P3)

**Goal**: After a successful implement stage, run `postImplementCommand` and post ✅/⚠️ comment.

**Independent Test**: Set `postImplementCommand` to a script that writes a sentinel file → verify file exists + ✅ comment posted after implement completes.

### Tests for User Story 4 (MANDATORY — constitution Principle IV)

- [X] T053 [P] [US4] Write unit tests for post-implement hook in `test/unit/stage-executor.test.js`: command fires when `postImplementCommand` non-empty after implement sentinel, skipped when empty, ⚠️ comment posted on non-zero exit code, job status remains `completed` even if hook fails, `try/catch` prevents propagation

### Implementation for User Story 4

- [X] T054 [US4] Implement post-implement hook in `src/daemon/stage-executor.js`: after implement sentinel detected, if `config.postImplementCommand` non-empty: `child_process.execFile('/bin/sh', ['-c', cmd], { timeout: 30000 })`; on success post `✅ Post-implement hook completed:\n${stdout}`; on non-zero/timeout post `⚠️ Post-implement hook failed (exit ${code}):\n${stderr}`; entire block wrapped in `try/catch` — hook error never changes job outcome

**Checkpoint**: Post-implement hook fires and posts comment; pipeline unaffected by hook failures.

---

## Phase 7: Polish & Migration

**Purpose**: Remove Python artifacts, update documentation, validate end-to-end.

- [X] T055 Delete `backend/` Python directory entirely (all Python source, tests, requirements.txt, venv)
- [X] T056 [P] Move `setup/test/setup.test.js` tests into `test/unit/init.test.js` (absorb existing setup tests) and delete the `setup/` directory (its code is now in `src/cli/init.js`)
- [X] T057 [P] Update `CLAUDE.md`: replace Python/FastAPI/Redis architecture diagram with Node.js daemon diagram; update tech stack table; replace `cd backend && .venv/bin/pip install` instructions with `npm install -g cockpit`; remove Docker/Redis section; update ops commands to use `cockpit` CLI
- [X] T058 [P] Update `README.md`: prerequisites table (Node 18+, git, claude, uv optional); quick start: `npm install -g cockpit`, `cockpit init`, `cockpit start`; issue naming section; remove all Python/Docker references
- [X] T059 Run full test suite `npm test` and confirm all tests pass (0 failures)
- [X] T060 Smoke test per `quickstart.md` Scenario 1: `cockpit init --yes` with test env vars, `cockpit start`, `cockpit status` shows running

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 (needs config module)
- **US2 (Phase 4)**: Depends on Phase 2 (needs full DB layer)
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (needs DB for logs/status)
- **US4 (Phase 6)**: Depends on US2 (extends stage-executor)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependency on US2/US3/US4
- **US2 (P1)**: Can start after Phase 2 — no dependency on US1/US3/US4
- **US3 (P2)**: Depends on US2 (reads DB written by daemon); can be partially tested with mock DB
- **Note**: T040 (`startPollLoop`) now receives the already-opened `db` handle from T039 (daemon entry point) rather than a `dbPath` string — T039 opens the DB, runs crash recovery, then passes `db` to `startPollLoop(db)`
- **US4 (P3)**: Extends US2 stage-executor — must be added after T042

### Within Each Phase

- Tests written first, confirmed failing before implementation
- DB modules (T011–T016) are independent of each other: all can run in parallel after T011 (schema init)
- CLI commands (T047–T052) are independent of each other: all [P]-parallelisable

---

## Parallel Execution Examples

### Phase 2: Foundational

```
Parallel group A (tests — after T006 schema tests pass):
  T007 job CRUD tests
  T008 log tests
  T009 dedup/PR tests
  T010 config tests

Parallel group B (implementation — after T011 schema impl):
  T012 jobs.js
  T013 logs.js
  T014 comments.js
  T015 prs.js
  T016 pr-reviews.js
  T017 config.js  ← independent of DB modules
```

### Phase 4: User Story 2

```
Parallel group (tests):
  T030 watcher tests
  T031 commenter tests
  T032 claude-process tests
  T033 stage-executor tests

Sequential implementation:
  T034 → T035 (both in github/) parallelisable
  T036 → T037 → T038 (claude-process) sequential
  T043 integration test (written alongside T030–T033, before T034)
  T034 → T035 (github/ modules) parallelisable
  T036 (commenter) parallelisable with T034/T035
  T037 → T038 (claude-process) sequential
  T039 → T040 → T041 → T042 (daemon) sequential
```

### Phase 5: User Story 3

```
Parallel group (tests + impl all touch different files):
  T044 + T047 daemon-control
  T045 + T049 logs
  T046 + T050 repos
  T048 status (extends daemon-control)
  T051 token
  T052 cli/index.js (after all subcommands done)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (cockpit init)
4. Complete Phase 4: US2 (daemon pipeline)
5. **STOP and VALIDATE**: `cockpit init` + open `[COCKPIT]` issue → pipeline runs and posts comments
6. Phase 5–7 can follow incrementally

### Incremental Delivery

1. Setup + Foundational → DB and config tested, installable package
2. US1 → `cockpit init` works, service file written
3. US2 → full pipeline working, issues processed
4. US3 → management CLI complete, operational control
5. US4 → post-implement hook added
6. Polish → Python deleted, docs updated, smoke tested

---

## Notes

- `[P]` tasks touch different files and have no blocking dependency — safe to run in parallel
- `[Story]` label maps each task to its user story for traceability
- Each user story phase produces an independently testable increment
- All test tasks should fail before their paired implementation task
- Native modules (`better-sqlite3`, `node-pty`) require `npm install` to build — verify in T005 before proceeding
- Config file permissions (`0o600`) must be verified in tests, not just asserted in code
- `cockpit daemon` is invoked by the OS service manager, not by the user — `cockpit init` wires this up
