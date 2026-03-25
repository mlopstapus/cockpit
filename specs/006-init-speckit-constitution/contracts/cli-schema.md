# CLI Contract: cockpit init (006-init-speckit-constitution changes)

This document describes the updated interactive and non-interactive contracts for `cockpit init` after this feature is implemented.

---

## Interactive Mode (`cockpit init`)

### Unchanged steps (steps 1–6)

Prerequisites check → GitHub token → GitHub owner → service file → enable service → specify-cli install

### Changed: Repo setup loop

Each iteration of the "add a repo" loop now runs:

```
Step A: "Have you already cloned this repo locally?" [confirm: yes/no]

  Branch YES:
    Step B: "Local clone path for <repo>:" [text, required, must be non-empty]
    → warn if path does not exist on disk (non-fatal, matches current behaviour)

  Branch NO:
    Step B: "GitHub repo (owner/name or HTTPS URL):" [text, required]
    → validate: parseable as owner/repo (shorthand or github.com URL)
    Step C: "Clone destination:" [text, default: ~/repos/<repo-name>]
    → if destination is non-empty directory: confirm "Directory is non-empty. Continue?" [confirm]
    → git clone https://<token>@github.com/<owner>/<repo>.git <destination>
    → stream clone output; on non-zero exit: show error, re-prompt or skip

Step D: "Add another repo?" [confirm: no]
```

### New: Spec-kit install (per repo, after repo registered)

```
Step E: "Install spec-kit into <localPath>?" [confirm: no]

  Branch YES:
    → check `specify` on PATH; if absent: show install instructions, skip
    → spawnSync('specify', ['init', localPath, '--ai', 'claude'], { stdio: 'inherit' })
    → on non-zero exit: show error message, continue (do not abort init)

  Branch NO: skip

Step F: "Set up a project constitution for <localPath>?" [confirm: no]
  (Only offered if spec-kit install succeeded or was already present)

  Branch YES:
    Prompt 1: "Core principles for this project:" [text, default provided]
    Prompt 2: "Security requirements:" [text, default provided]
    Prompt 3: "Development workflow (branching, review, testing):" [text, default provided]
    Prompt 4: "Governance (how are decisions made?):" [text, default provided]
    → write <localPath>/.specify/memory/constitution.md

  Branch NO: skip
```

---

## Non-Interactive Mode (`cockpit init --yes`)

### Existing env vars (unchanged)

| Env var | Required | Description |
|---------|----------|-------------|
| `GITHUB_TOKEN` | yes | GitHub PAT |
| `GITHUB_OWNER` | yes | GitHub username |
| `GITHUB_REPOS` | yes | Comma-separated `owner/repo` list |
| `REPO_LOCAL_PATHS` | no | JSON map of `owner/repo` → local path |
| `POLL_INTERVAL` | no | Poll interval in seconds (default: 30) |
| `POST_IMPLEMENT_COMMAND` | no | Post-implement shell command |

### New env vars

| Env var | Required | Description |
|---------|----------|-------------|
| `SPECKIT_INIT` | no | If `1`, run `specify init <localPath> --ai claude` for each registered repo after config is written |

**Notes:**
- Clone step is not available in `--yes` mode. All repos must have `localPath` set via `REPO_LOCAL_PATHS`.
- Constitution wizard is not available in `--yes` mode (requires interactive prompts).
- `SPECKIT_INIT=1` invokes `specify init` for each repo synchronously; non-zero exit is logged as a warning but does not abort.

---

## Exported Functions (public surface for unit testing)

These pure/injectable helpers are exported from `src/cli/init.js`:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `parseRepoIdentifier(input)` | `(string) → string\|null` | Normalize `owner/repo` or HTTPS URL to `owner/repo`; return null if invalid |
| `buildCloneUrl(ownerRepo, token)` | `(string, string) → string` | Construct `https://<token>@github.com/<owner>/<repo>.git` |
| `cloneRepo(cloneUrl, dest, { spawnFn })` | `(string, string, opts) → { ok, error }` | Run git clone; injectable `spawnFn` for tests |
| `runSpecifyInit(localPath, { which, spawnFn })` | `(string, opts) → { ok, error }` | Check PATH + invoke `specify init`; injectable for tests |
| `buildConstitutionMarkdown(answers)` | `(object) → string` | Pure: render markdown from four constitution answers |
| `checkPrereqs(opts)` | existing | Unchanged |
| `buildConfigFromEnv(env)` | existing | Unchanged |
| `buildServiceContent(template, tokens)` | existing | Unchanged |
| `getServicePath(platform, homeDir)` | existing | Unchanged |
