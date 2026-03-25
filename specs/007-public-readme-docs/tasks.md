# Tasks: Public-Facing README and Documentation

**Input**: Design documents from `/specs/007-public-readme-docs/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, contracts/readme-structure.md ✅, quickstart.md ✅

**Note**: This is a documentation-only feature (static markdown). No executable code paths exist. Tests are replaced by a manual acceptance checklist review in the Polish phase (justified deviation from Principle IV — documented in plan.md Complexity Tracking).

**Organization**: Tasks are grouped by user story. Each story delivers independently testable value.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: Confirm current state against the section contract before making changes.

- [X] T001 Read `README.md`, `specs/007-public-readme-docs/contracts/readme-structure.md`, and `specs/007-public-readme-docs/quickstart.md` to produce an in-memory gap list confirming which of the 8 missing items still need to be added before starting implementation

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Add the Architecture flow diagram — the Security & Trust callout (US1) must be positioned immediately after it, so this must exist first.

**⚠️ CRITICAL**: US1 work (T003–T005) cannot begin until this phase is complete.

- [X] T002 Replace the Architecture bullet-list in `README.md` with an ASCII text flow diagram (fenced `text` block) showing: `GitHub Issue → GithubWatcher (poll) → SQLite job queue → PollLoop → Claude Code (PTY) → Issue comments + PR`; retain the existing tech-stack bullet list below the diagram

**Checkpoint**: Architecture section has a readable flow diagram — US1 work can now begin.

---

## Phase 3: User Story 1 — First-Time Evaluator Reads README (Priority: P1) 🎯 MVP

**Goal**: A developer landing on the GitHub repo page understands what Cockpit does and who it is for within 60 seconds.

**Independent Test**: Read `README.md` cold (no prior knowledge) and verify: tool purpose is clear from the first screen, the security posture is explained, and the MIT badge is visible.

- [X] T003 [P] [US1] Add a single MIT license badge to the title line in `README.md` (shield: `https://img.shields.io/badge/license-MIT-blue.svg`); place inline with the `# Cockpit` heading or on the line immediately below it
- [X] T004 [P] [US1] Add a `> [!NOTE]` GitHub admonition block immediately after the Architecture section in `README.md` with the heading **Security & Trust** and 5 bullets: (1) `--dangerously-skip-permissions` grants Claude Code full file-system and shell access within your local repo clone, (2) Claude runs entirely on your machine — no cloud agent or remote execution, (3) nothing leaves your machine except GitHub API calls for issue comments and PR creation, (4) Cockpit does not send your code to any third-party service beyond what Claude Code itself does, (5) review each PR before merging — you are the last gate
- [X] T005 [US1] Do a tone pass on the opening paragraph and How It Works section of `README.md`: remove any "we" language, keep tone honest and first-person where natural; do not restructure or reorder sections

**Checkpoint**: US1 complete — evaluator can understand the tool and its security model from the first read.

---

## Phase 4: User Story 2 — Developer Follows Quick Start (Priority: P2)

**Goal**: A developer with prerequisites ready follows Quick Start and has the daemon running without reading any other docs.

**Independent Test**: Follow Quick Start steps verbatim and confirm daemon starts and picks up a `[COCKPIT]` test issue.

- [X] T006 [P] [US2] Verify the Quick Start section in `README.md` has all four steps (install → `cockpit init` → `cockpit start` → open `[COCKPIT]` issue); if any step is missing or unclear, fix it; confirm the non-interactive init block (`--yes` with env vars) is present
- [X] T007 [US2] Add a **Contributing** section (one sentence + link to `CONTRIBUTING.md`) to `README.md` just before the Development section: `Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for bug reports, feature requests, and the PR workflow.`

**Checkpoint**: US2 complete — Quick Start is end-to-end and the contributing entry point is visible.

---

## Phase 5: User Story 3 — CLI Command Reference Lookup (Priority: P3)

**Goal**: A returning user finds any CLI command or flag in under 30 seconds without leaving the README.

**Independent Test**: Using only the README CLI section, locate: (a) the flag to follow logs live, (b) the command to list recent jobs.

- [X] T008 [P] [US3] Add `cockpit jobs [-n N]` to the CLI section in `README.md` (after `cockpit logs` entry) with description `List recent jobs and their status`; also add `cockpit daemon` with the note `Start the daemon process (internal — use cockpit start instead)` so all commands from `cockpit --help` are represented
- [X] T009 [US3] Update the `cockpit logs` entry in the CLI section of `README.md` to include the `-f` / `--follow` flag: change the entry to `cockpit logs [job-id] [-n N] [-f]  Tail daemon logs or a specific job's log (-f to follow)`

**Checkpoint**: US3 complete — all top-level commands (including `jobs` and `daemon`) and key flags are documented, satisfying FR-004 and SC-005.

---

## Phase 6: User Story 4 — Self-Resolving a Common Problem (Priority: P3)

**Goal**: A user whose daemon is not picking up issues resolves the problem using the README alone.

**Independent Test**: Introduce a common error (e.g., wrong PAT scope) and verify the Troubleshooting section leads to the correct resolution without external links.

- [X] T010 [US4] Add a `## Q&A` section to `README.md` after the Issue Naming section with 8 entries (≥6 required by FR-005; 8 planned per research.md) using `### Question?` + answer format: (1) Does Cockpit cost money? (2) What platforms are supported? (3) What happens if the daemon crashes mid-job? (4) How do I add more repos without re-running init? (5) How do I answer clarification questions during a job? (6) Will Cockpit auto-merge the PR it creates? (7) Can Cockpit run multiple jobs in parallel? (8) Does my code leave my machine?
- [X] T011 [US4] Add a `## Troubleshooting` section to `README.md` after the Q&A section with 5 failure modes (use `### Symptom` + resolution format): (1) Daemon not running / won't start — check `cockpit status`, check service file, run `cockpit start`; (2) Issues not being picked up — check `githubOwner` matches the issue author, check poll interval, confirm repo is in config; (3) Rate limit hit — Cockpit detects this automatically, check `cockpit status` for rate-limited state, it will auto-retry; (4) Auth / token errors — confirm PAT has `repo` scope, rotate with `cockpit token`; (5) macOS: launchd not restarting daemon after deploy — run `cockpit restart` manually after each update

**Checkpoint**: US4 complete — all 4 documented failure modes have resolution paths; Q&A covers 8 self-contained answers.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Create `CONTRIBUTING.md` and run final acceptance validation.

- [X] T012 [P] Create `CONTRIBUTING.md` at repo root with four sections: **Bug Reports** (open a GitHub issue with steps to reproduce), **Feature Requests** (open a `[COCKPIT]`-prefixed issue — Cockpit builds its own features using itself), **Pull Requests** (fork → create `###-short-name` branch → ensure `npm test` passes → open PR against `main`; note auto-merge is prohibited), **Local Development** (`git clone`, `npm install`, `npm test`, `npm run lint`, `node src/daemon/index.js` for manual daemon start)
- [X] T013 Review `README.md` against the acceptance checklist in `specs/007-public-readme-docs/quickstart.md` and verify every FR-001–FR-014 item is satisfied; specifically: (a) scan every fenced code block for a language identifier — add one to any block missing it (FR-009), (b) confirm Configuration section documents all fields from `CLAUDE.md` including `postImplementCommand` and `startupCommand` (FR-010), (c) confirm `daemon` command is in the CLI section noted as internal (FR-004/SC-005); fix any remaining gaps found during this review

**Checkpoint**: All user stories complete, CONTRIBUTING.md created, README validated against full acceptance checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks US1 tasks (T003–T005)
- **Phase 3 (US1 P1)**: Depends on Phase 2 — T003 and T004 can run in parallel; T005 after T003
- **Phase 4 (US2 P2)**: Depends on Phase 2 — T006 and T007 can run in parallel
- **Phase 5 (US3 P3)**: Depends on Phase 2 — T008 and T009 can run in parallel (but T009 edits same line area as T008, so run sequentially to be safe)
- **Phase 6 (US4 P3)**: Depends on Phase 2 — T010 then T011 sequentially (Troubleshooting section must follow Q&A section in the document)
- **Phase 7 (Polish)**: Depends on all previous phases — T012 is independent of README edits; T013 must be last

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 (architecture diagram must exist before security callout positioned)
- **US2 (P2)**: Independent of US1 — can start after Phase 2
- **US3 (P3)**: Independent of US1/US2 — can start after Phase 2
- **US4 (P3)**: Independent of US1/US2/US3 — can start after Phase 2

### Within Each User Story

- All `[P]`-marked tasks within a phase can run concurrently
- Section insertion tasks must run in order when they affect adjacent lines in the same file

---

## Parallel Execution Example: After Phase 2 Completes

```bash
# US1 parallel tasks:
Task: "T003 — Add MIT license badge to README.md title"
Task: "T004 — Add Security & Trust callout block to README.md"

# US2 parallel tasks (same time as US1 if desired):
Task: "T006 — Verify Quick Start completeness in README.md"
Task: "T007 — Add Contributing one-liner to README.md"

# US3 parallel tasks:
Task: "T008 — Add jobs + daemon commands to CLI section in README.md"
Task: "T009 — Add -f flag to logs entry in README.md"

# Polish parallel:
Task: "T012 — Create CONTRIBUTING.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational — architecture diagram (T002)
3. Complete Phase 3: US1 — badge, security callout, tone pass (T003–T005)
4. **STOP and VALIDATE**: README opens with clear hook, security model explained, license visible
5. Continue to US2, US3, US4 in order

### Incremental Delivery

1. T001–T002 → Foundation ready
2. T003–T005 → US1 complete (evaluator-facing content solid)
3. T006–T007 → US2 complete (quick start + contributing path clear)
4. T008–T009 → US3 complete (CLI reference exhaustive)
5. T010–T011 → US4 complete (Q&A + Troubleshooting added)
6. T012–T013 → Polish complete, PR ready

---

## Notes

- All edits target `README.md` or create `CONTRIBUTING.md` — no `src/` changes
- `LICENSE` already exists (MIT, 2026) — FR-012 is pre-satisfied, no task needed
- Section insertion order matters: Q&A before Troubleshooting (both after Issue Naming)
- Security callout must come after Architecture diagram (T002 before T004)
- T013 (final review) must be the last task executed
