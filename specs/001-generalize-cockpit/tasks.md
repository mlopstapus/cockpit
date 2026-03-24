---
description: "Task list for Generalize Cockpit for Any Project"
---

# Tasks: Generalize Cockpit for Any Project

**Input**: Design documents from `/specs/001-generalize-cockpit/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Per constitution Principle IV, tests are written alongside implementation for the
highest-risk paths: the JobStore rewrite and the post-implement hook. See constitution for all
six principles.

**Organization**: Tasks grouped by user story. US3 (Python backend) and US1 (Node.js CLI) are
both P1 and have zero file overlap — they can be worked in parallel after the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no conflicts with other [P] tasks in same phase)
- **[Story]**: User story label (US1–US5)

---

## Phase 1: Setup

**Purpose**: Scaffold directories and declare dependencies before any implementation begins.

- [x] T001 Create `setup/` directory and `setup/templates/` subdirectory per plan.md
- [x] T002 [P] Create `setup/package.json`: `"type": "module"`, `"engines": {"node": ">=18.0.0"}`, dependencies `@clack/prompts@^0.7`, `commander@^12`, `chalk@^5`, script `"setup": "node index.js"`
- [x] T003 [P] Update `backend/requirements.txt`: remove `redis` / `redis[hiredis]`; add `aiosqlite>=0.20`

---

## Phase 2: Foundational

**Purpose**: Shared config changes that US3 and US2 both depend on. Must complete before
implementation on those stories begins.

**⚠️ CRITICAL**: US3 and US2 cannot start until T004 is complete.

- [x] T004 Update `backend/config.py`: (a) remove `redis_url` field and `REDIS_URL` env mapping; (b) remove `expo_restart_enabled` field and `EXPO_RESTART_ENABLED` env mapping; (c) add `db_path: str = "~/.cockpit/cockpit.db"` with `DB_PATH` env mapping; (d) add `post_implement_command: str = ""` with `POST_IMPLEMENT_COMMAND` env mapping; (e) change `github_owner` default from `"mlopstapus"` to `""`; (f) change `github_repos` default from `["mlopstapus/seamless"]` to `[]`

**Checkpoint**: Config changes done — US3 (backend) and US1 (Node.js CLI) can now start in parallel.

---

## Phase 3: US3 — Replace Redis/Docker with Embedded Storage (P1)

**Goal**: Remove Docker and Redis as hard dependencies. All job state lives in SQLite via aiosqlite.
The `JobStore` public API is preserved exactly so all callers need zero changes.

**Independent Test**: With Docker not running, start Cockpit, create a `[COCKPIT]` issue, and
verify the pipeline runs end-to-end and job state survives a process restart.

- [x] T005 [US3] Rewrite `backend/services/job_store.py`: replace all `redis.asyncio` imports and operations with `aiosqlite`; implement `async _init_db(db_path: str)` that creates all 6 tables (`jobs`, `job_logs`, `seen_comments`, `active_prs`, `seen_pr_comments`, `pr_review_jobs`) and their indexes using `CREATE TABLE IF NOT EXISTS` from `data-model.md`; run `PRAGMA journal_mode=WAL` on init; implement `dequeue()` as a SELECT+UPDATE transaction on `status='queued' ORDER BY created_at LIMIT 1` with `await asyncio.sleep(0.5)` polling on empty result; preserve identical public signatures for all existing methods: `enqueue`, `dequeue`, `get`, `update`, `mark_active`, `mark_complete`, `mark_failed`, `mark_cancelled`, `append_log`, `get_log_tail`, `is_comment_seen`, `mark_comment_seen`, `list_active`, `list_recent`, `register_active_pr`, `get_active_pr`, `list_active_prs`, `deregister_pr`, `is_pr_comment_seen`, `mark_pr_comment_seen`, `enqueue_pr_review`, `dequeue_pr_review`; implement log buffer trim as `DELETE FROM job_logs WHERE job_id=? AND seq < (SELECT MAX(seq) - 1000 FROM job_logs WHERE job_id=?)`

- [x] T006 [P] [US3] Rewrite `backend/tests/test_job_store.py`: update all `pytest_asyncio` fixtures to construct `JobStore` and call `await store._init_db(":memory:")` in setup; test critical paths: enqueue deduplication by `(github_repo, issue_number)`; FIFO dequeue ordering; full status lifecycle (queued→running→completed, failed, cancelled); `append_log` with 1000-line trim; `is_comment_seen`/`mark_comment_seen` dedup; `register_active_pr`/`list_active_prs`/`deregister_pr`; `enqueue_pr_review`/`dequeue_pr_review`

- [x] T007 [US3] Update `backend/main.py`: replace `aioredis.from_url(settings.redis_url)` startup with `job_store = JobStore()` and `await job_store._init_db(settings.db_path)`; update the FastAPI lifespan context manager; remove all remaining `aioredis` imports; verify `uvicorn main:app` starts without error as a smoke test after changes

- [x] T008 [P] [US3] Delete `docker-compose.yml` from the repository root

- [x] T009 [P] [US3] Delete `seamless-expo.service` from the repository root

**Checkpoint**: `pytest backend/tests/test_job_store.py -q` passes with no Docker or Redis running.

---

## Phase 4: US1 — First-Time Setup via Interactive CLI (P1)

**Goal**: `node setup/index.js` guides a new developer through Cockpit configuration, generates
`.env` and a platform-appropriate service file, installs `specify-cli`, and prints next-step
instructions — all in under 15 minutes with no manual file editing.

**Independent Test**: Run `node setup/index.js` on Linux and macOS; verify `.env` contains no
`mlopstapus`/`seamless` references, the correct service file is generated, and `specify` is
available on PATH after setup.

> T010–T015 create distinct new files — all can be written in parallel.

- [x] T010 [P] [US1] Create `setup/index.js`: ESM entry; import `commander`, `chalk`, and phase modules (`prompts.js`, `render.js`); define program with `--yes/-y` and `--target <path>` flags; at startup verify `git`, `uv`, and `claude` are on PATH — on any missing print install instructions and exit with code 2; orchestrate phases sequentially: `checkPrereqs()` → `runCockpitConfigPhase(opts)` → `runServiceFilePhase(profile)` → `runSpecKitPhase(profile)` → `printNextSteps(profile)`; handle ctrl-C/cancel exit with code 1

- [x] T011 [P] [US1] Create `setup/prompts.js`: export async `collectCockpitConfig(opts)` using `@clack/prompts`; implement prompts in order: (1) GitHub Personal Access Token (password/masked, required), (2) GitHub owner (text, required), (3) repos to watch comma-separated (text, required), (4) local path for each repo (loop of text prompts, one per repo — if a path does not exist yet, print a warning but do not abort), (5) post-implement command (text, optional, placeholder "e.g. systemctl --user restart my-app"), (6) database path (text, default `~/.cockpit/cockpit.db`); in `--yes` mode return defaults without prompting; auto-detect `os` from `process.platform` and `username` from `os.userInfo().username`; return a `SetupProfile` object

- [x] T012 [P] [US1] Create `setup/render.js`: export `renderTemplate(templatePath, values)` — reads file, replaces all `{{TOKEN}}` occurrences with `values[TOKEN]`; export async `writeEnvFile(profile, cockpitDir, opts)` — renders `.env.template`, checks for existing `.env` and prompts "`.env` already exists — overwrite? [y/N]" (bypassed by `--yes`), writes file, prints chalk confirmation; export `writeServiceFile(profile, cockpitDir)` — branches on `profile.os`, renders correct template, writes service file, prints copy/load command instructions

- [x] T013 [P] [US1] Create `setup/templates/.env.template`: include keys `GITHUB_TOKEN={{GITHUB_TOKEN}}`, `GITHUB_OWNER={{GITHUB_OWNER}}`, `GITHUB_REPOS={{GITHUB_REPOS}}`, `REPO_LOCAL_PATHS={{REPO_LOCAL_PATHS}}`, `GITHUB_POLL_INTERVAL=30`, `DB_PATH={{DB_PATH}}`, `POST_IMPLEMENT_COMMAND={{POST_IMPLEMENT_COMMAND}}`, `PR_COMMENTS_ENABLED=true`, `DEBUG=false`; add inline `#` comments explaining each variable; add footer comment: `# Future: secrets can also be stored in GitHub Secrets/Environments and injected at runtime via your service's EnvironmentFile`

- [x] T014 [P] [US1] Create `setup/templates/cockpit-api@.service.template`: systemd unit with `Description=Cockpit API`, `Type=simple`, `User={{USERNAME}}`, `WorkingDirectory={{COCKPIT_DIR}}`, `EnvironmentFile={{COCKPIT_DIR}}/.env`, `ExecStart={{COCKPIT_DIR}}/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir {{COCKPIT_DIR}}/backend`, `Restart=always`, `RestartSec=5`, `[Install] WantedBy=multi-user.target`

- [x] T015 [P] [US1] Create `setup/templates/com.cockpit.api.plist.template`: launchd plist with `Label=com.cockpit.api`, `ProgramArguments` array for uvicorn with same args as T014, `WorkingDirectory={{COCKPIT_DIR}}/backend`, `EnvironmentVariables` dict (all `.env` keys with `{{TOKEN}}` values), `RunAtLoad=true`, `KeepAlive=true`, `StandardOutPath={{HOME}}/Library/Logs/cockpit-api.log`, `StandardErrorPath={{HOME}}/Library/Logs/cockpit-api-error.log`

- [x] T015b [P] [US1] Create `setup/test/setup.test.js` using `node:test`: test (1) `renderTemplate()` — verify all `{{TOKEN}}` occurrences are replaced and unknown tokens left untouched; (2) `collectCockpitConfig({ yes: true })` — verify all prompt fields return expected defaults without interactive input; (3) `writeServiceFile()` Linux branching — verify `cockpit-api@.service.template` is selected when `profile.os === 'linux'`; (4) `writeServiceFile()` macOS branching — verify `com.cockpit.api.plist.template` is selected when `profile.os === 'darwin'`; run with `node --test setup/test/setup.test.js`

- [x] T016 [US1] Implement `runSpecKitPhase(profile)` in `setup/index.js`: prompt "Install specify-cli (spec-kit)? [Y/n]" (skipped in `--yes` mode — auto-yes); run `spawnSync('uv', ['tool', 'install', 'specify-cli', '--from', 'git+https://github.com/github/spec-kit.git'], { stdio: 'inherit' })`; on exit 0 print chalk green "✅ specify-cli installed"; on non-zero print chalk yellow warning with exit code; continue regardless (non-fatal)

- [x] T017 [US1] Implement `printNextSteps(profile)` in `setup/index.js`: after all phases complete, print a chalk-formatted box with: heading "🚀 Cockpit is configured! Next steps:"; step 1 — enable service (Linux: `sudo systemctl enable --now cockpit-api@{{username}}`; macOS: `launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist`); step 2 — `cd <targetRepo> && specify init --here --ai claude`; step 3 — "Open Claude Code in `<targetRepo>` and run `/speckit.constitution` to create your project constitution"; step 4 — "Open an issue titled `[COCKPIT] <feature>` in your watched repo to trigger the pipeline"; include Expo migration hint: "Existing Expo users: set `POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo` in `.env` to preserve previous behavior"

**Checkpoint**: `node setup/index.js --help` exits 0 with usage. Full run on a test repo completes all
4 phases, writes `.env` and service file, installs specify-cli, prints next-steps block.

---

## Phase 5: US2 — Configurable Post-Implement Hook (P2)

**Goal**: Replace the hardcoded `_restart_expo()` with a generic `POST_IMPLEMENT_COMMAND` hook
executed via `/bin/sh -c`. Pipeline completion is never affected by hook outcome.

**Independent Test**: Set `POST_IMPLEMENT_COMMAND=echo ran >> /tmp/hook-test.txt` in `.env`;
run a full pipeline to implement; verify file is created and GitHub issue comment shows ✅.

- [x] T018 [US2] Rewrite hook logic in `backend/services/pipeline_runner.py`: delete `_restart_expo()` method and `_EXPO_RESTART_CMD` constant; add `async _run_post_implement_hook(self, job)` that: (1) reads `settings.post_implement_command` and returns immediately if empty; (2) runs `await asyncio.create_subprocess_shell(cmd, cwd=job.repo_path, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)`; (3) wraps in `asyncio.wait_for(..., timeout=30.0)`; (4) on exit 0 posts "✅ Post-implement hook ran successfully." to issue; (5) on non-zero exit posts "⚠️ Post-implement hook failed (exit `<code>`): `<stderr[:200]>`"; (6) on `asyncio.TimeoutError` posts "⚠️ Post-implement hook timed out after 30s."; (7) wraps entire method in try/except so hook errors never propagate to pipeline; replace the `if settings.expo_restart_enabled: await self._restart_expo(job)` call with `await self._run_post_implement_hook(job)`

- [x] T019 [P] [US2] Create `backend/tests/test_pipeline_runner.py`: add tests using `unittest.mock.patch` on `asyncio.create_subprocess_shell`; test (1) hook fires and posts ✅ comment when `post_implement_command` is set and exits 0; (2) hook is skipped silently when `post_implement_command` is empty; (3) warning comment posted when hook exits non-zero; (4) pipeline `mark_complete` is still called regardless of hook exit code

**Checkpoint**: All pipeline_runner tests pass. Verify Expo migration: setting
`POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo` produces same behavior as the
old `EXPO_RESTART_ENABLED=true`.

---

## Phase 6: US5 — Remove All Hardcoded Project References (P2)

**Goal**: Zero occurrences of `mlopstapus`, `seamless`, or `seamless-expo` anywhere in source,
config defaults, or example files.

**Independent Test**: `grep -r "mlopstapus\|seamless-expo\|seamless" backend/ setup/ .env.example`
returns no matches.

- [x] T020 [P] [US5] Audit all `backend/` Python files for `mlopstapus`, `seamless`, or Expo-specific strings: run `grep -rn "mlopstapus\|seamless\|expo" backend/`; fix every occurrence — replace hardcoded defaults with empty strings or generic values; remove project-specific comments; pay particular attention to `pipeline_runner.py` for any remaining Expo/seamless log messages, comments, or constants not already removed in T018

- [x] T021 [P] [US5] Move `cockpit-api@.service` at repo root (if still present as a filled-in file) to `setup/templates/cockpit-api@.service.template`; replace any hardcoded username (e.g. `ben-anderson`) with `{{USERNAME}}`; replace hardcoded repo paths with `{{COCKPIT_DIR}}`; if it was already templatized in T014, verify it matches and delete the root copy

**Checkpoint**: `grep -r "mlopstapus\|seamless" backend/ setup/` returns zero results.

---

## Phase 7: US4 — Update Outdated Documentation (P2)

**Goal**: Every doc reflects the current setup-CLI-based, Docker-free, SQLite-backed workflow.
A new user can follow CLAUDE.md from a fresh clone to a running Cockpit with no Docker steps.

**Independent Test**: Follow the updated CLAUDE.md "Running" section from a fresh clone;
every command succeeds; no Docker/Redis/mlopstapus/seamless references encountered.

- [x] T023 [P] [US4] Rewrite `CLAUDE.md`: (a) update "How It Works" — replace Redis mention with SQLite embedded store; (b) update architecture diagram — remove Redis row, replace with `SQLiteJobStore` row; (c) replace "Running" section entirely — step 1: `node setup/index.js`; add Node.js 18+ as a prerequisite; no docker-compose step; (d) update "Configuration" env-var table — remove `REDIS_URL`, `EXPO_RESTART_ENABLED`; add `DB_PATH`, `POST_IMPLEMENT_COMMAND`; (e) update "Key Services" table — `JobStore` description to "SQLite-backed embedded store"; (f) update system tools table — remove Docker; (g) keep "Issue Naming" section unchanged; (h) add note that Tailscale/VPN is optional, not required by the product; (i) add Expo migration note: `POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo`

- [x] T024 [P] [US4] Rewrite `.env.example`: use generic placeholders throughout (`your-github-token`, `your-github-username`, `your-org/your-repo`); add `DB_PATH=~/.cockpit/cockpit.db` with comment; add `POST_IMPLEMENT_COMMAND=` with comment "# Optional: shell command run after each successful implement stage (e.g. systemctl --user restart my-app)"; remove `EXPO_RESTART_ENABLED`; remove `REDIS_URL`; add footer comment about GitHub Secrets as a future alternative

- [x] T025 [P] [US4] Create `README.md` at repository root: 2–3 sentence project overview (GitHub-native AI pipeline for any project, powered by Claude Code); prerequisites (Node.js 18+, Python 3.11+, uv, git, claude); one-line setup (`node setup/index.js`); issue naming convention (`[COCKPIT] <feature>`); link to `CLAUDE.md` for full documentation

- [x] T026 [P] [US4] Verify `setup/templates/cockpit-api@.service.template` has descriptive inline comments on each `{{TOKEN}}` placeholder; verify `setup/templates/com.cockpit.api.plist.template` similarly annotated; confirm neither file contains any hardcoded username, path, or project name

**Checkpoint**: All docs reference `node setup/index.js`, contain no Docker steps, and no
project-specific identifiers. `README.md` exists at repo root.

---

## Phase N: Polish & Validation

**Purpose**: End-to-end verification that all stories integrate cleanly.

- [x] T027 Run `cd backend && .venv/bin/pytest tests/ -q` — all tests must pass; fix any failures
- [x] T028 [P] Run `cd setup && npm install && node index.js --help` — must exit 0 with usage output
- [x] T029 [P] Run hardcoded-reference audit: `grep -r "mlopstapus\|seamless-expo\|seamless" backend/ setup/ .env.example CLAUDE.md README.md` — must return zero results; fix any remaining occurrences
- [x] T030 [P] Confirm `docker-compose.yml` and `seamless-expo.service` no longer exist at repo root: `ls docker-compose.yml seamless-expo.service 2>&1` should show "No such file"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Requires Phase 1 complete — **blocks US3 and US2**
- **Phase 3 (US3)**: Requires Phase 2 (T004) — runs in parallel with Phase 4 (US1)
- **Phase 4 (US1)**: Requires Phase 1 (T001–T002) — runs in parallel with Phase 3 (US3); zero file conflict
- **Phase 5 (US2)**: Requires Phase 3 (US3) complete — pipeline_runner.py needs working job store
- **Phase 6 (US5)**: Requires Phase 2 (T004) complete — can overlap with Phase 5 (different files)
- **Phase 7 (US4)**: Requires Phases 3, 5, and 6 complete — docs must describe final state
- **Phase N (Polish)**: Requires all phases complete

### User Story Dependencies

| Story | Priority | Depends on | Can parallel with |
|-------|----------|------------|-------------------|
| US3 — SQLite | P1 | Foundational | US1 |
| US1 — Setup CLI | P1 | Phase 1 only | US3 |
| US2 — Hook | P2 | US3 complete | US5 |
| US5 — Hardcoded refs | P2 | Foundational | US2 |
| US4 — Docs | P2 | US3, US2, US5 | — |

### Parallel Execution Example

```bash
# After Phase 2 (T004) completes, start these simultaneously:

# Track 1 — Backend (US3)
Task: T005  Rewrite job_store.py
Task: T006  Rewrite test_job_store.py  [P with T005]
Task: T007  Update main.py             [after T005]
Task: T008  Delete docker-compose.yml  [P]
Task: T009  Delete seamless-expo.service [P]

# Track 2 — Node.js CLI (US1) — zero file conflict with Track 1
Task: T010  Create setup/index.js
Task: T011  Create setup/prompts.js    [P with T010]
Task: T012  Create setup/render.js     [P with T010]
Task: T013  Create .env.template       [P with T010]
Task: T014  Create service.template    [P with T010]
Task: T015  Create plist.template      [P with T010]
Task: T015b Create setup/test/setup.test.js [P with T010]
Task: T016  Wire spec-kit phase        [after T010]
Task: T017  Wire printNextSteps        [after T016]
```

---

## Implementation Strategy

### MVP First (US3 + US1)

1. Phase 1 + Phase 2 (Setup + Foundational)
2. Phase 3 (US3: SQLite) — tests pass, no Docker required ✅
3. Phase 4 (US1: Setup CLI) — new user can configure Cockpit ✅
4. **Validate both independently before continuing**

### Incremental Delivery

1. Phase 1 + 2 → scaffolding ready
2. US3 → Docker-free backend ✅
3. US1 → setup CLI works ✅
4. US2 → generic post-implement hook ✅
5. US5 → no hardcoded refs ✅
6. US4 → docs accurate ✅
7. Polish → all tests green, audit clean ✅

### Notes

- `JobStore` public API is unchanged — `pipeline_runner.py`, `github_watcher.py`, `comment_relay.py`, `pr_review_runner.py`, `pr_review_watcher.py` require no changes for US3 (only the constructor call in `main.py` changes)
- US1 and US3 have zero file overlap — the only shared concern is `backend/config.py` (T004), which must complete before both stories begin
- `uv` must be on PATH for spec-kit install (T016); setup checks for it at startup (T010) and prints `curl -LsSf https://astral.sh/uv/install.sh | sh` if missing
- `specify init --here --ai claude` and `/speckit.constitution` are user actions after setup, not automated by the CLI
