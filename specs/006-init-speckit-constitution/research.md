# Research: 006-init-speckit-constitution

## 1. How to git clone with PAT in-process (no credential helper)

**Decision:** Embed the PAT in the HTTPS URL: `https://<token>@github.com/<owner>/<repo>.git`

**Rationale:** The PAT is already in-process memory from the earlier wizard step. Embedding it in the URL is the standard git HTTPS auth mechanism — no credential helper, no `git config` mutation, no temp file. The URL is passed to `spawnSync` and never written to disk or logs.

**Security note:** The PAT-embedded URL MUST NOT be echoed to the terminal. Clone output is streamed via `stdio: 'inherit'` which only shows git's own progress (no URL in output). The URL is passed as an argument string to `/bin/sh -c`, so it is not visible in `ps aux` argument lists on macOS (the shell expands it immediately).

**Alternatives considered:**
- `GIT_ASKPASS` env var — more complex, requires a temp script file
- `git credential store` — mutates user's credential store; too invasive for a wizard
- `GIT_TERMINAL_PROMPT=0` + system credential — depends on user's existing git config; fragile

---

## 2. How to parse a GitHub repo identifier (owner/repo vs. full HTTPS URL)

**Decision:** Accept both `owner/repo` shorthand and full HTTPS URL (`https://github.com/owner/repo`). Normalize to `owner/repo` internally, then construct the clone URL.

**Rationale:** The spec says "e.g., `owner/repo` or full HTTPS URL". Normalizing early keeps downstream code simple.

**Parsing logic:**
```js
function parseRepoIdentifier(input) {
  const trimmed = input.trim();
  // Full URL: https://github.com/owner/repo or https://github.com/owner/repo.git
  const urlMatch = trimmed.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (urlMatch) return urlMatch[1];
  // Shorthand: owner/repo
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return trimmed;
  return null; // invalid
}
```

---

## 3. Default clone destination

**Decision:** Default to `~/repos/<repo-name>` (just the repo name part, not owner). Present as pre-filled default; user can edit before confirming.

**Rationale:** Mirrors common developer convention. `~/repos/` is the same pattern mentioned in the backlog item. The dir may or may not exist; if the parent `~/repos/` doesn't exist, create it via `fs.mkdirSync(..., { recursive: true })`.

---

## 4. `specify init` invocation

**Decision:** `spawnSync('specify', ['init', localPath, '--ai', 'claude'], { stdio: 'inherit' })`

**Rationale:** `specify` is a Python CLI installed globally via `uv tool install specify-cli`. `spawnSync` with `stdio: 'inherit'` streams all output to the terminal — the user sees `specify`'s own progress and any "already installed" prompts. Cockpit acts only on the exit code (0 = success, non-zero = failure).

**PATH check:** Use the same `which` wrapper pattern already in `checkPrereqs`. If `specify` is not on PATH, show a clear install message before offering the spec-kit step — do not attempt invocation.

**Alternatives considered:**
- Pre-check for `.specify/` directory — rejected per clarification Q5; `specify init` owns that check
- Download/copy scaffold manually — rejected per clarification Q4

---

## 5. Constitution wizard output path

**Decision:** Write to `<localPath>/.specify/memory/constitution.md`

**Rationale:** This matches the constitution path in the cockpit repo itself (`.specify/memory/constitution.md`) and the spec assumption about "spec-kit memory directory". If `specify init` ran successfully, this directory exists. If `specify init` was skipped, the wizard step is also skipped.

**Template structure:** Produce a markdown document with the four major section headings (Core Principles, Security Requirements, Development Workflow, Governance) populated from the wizard's prompt answers.

---

## 6. `--yes` mode extensions

**Decision:** No new env vars required for the clone path. In `--yes` mode, `REPO_LOCAL_PATHS` can map a repo to an empty string, which is already flagged as a warning in `buildConfigFromEnv`. Spec-kit and constitution wizard steps are skipped unless `SPECKIT_INIT=1` env var is set.

**Rationale:** Keeps the non-interactive path simple. CI users who want spec-kit can add `SPECKIT_INIT=1` and `REPO_LOCAL_PATHS` with actual paths to trigger the automated `specify init` call (no interactive constitution wizard in `--yes` mode).
