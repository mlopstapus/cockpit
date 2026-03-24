# Research: Repo Startup Commands

**Feature**: 003-repo-startup-command
**Date**: 2026-03-24

## 1. Existing `postImplementCommand` Pattern

**Decision**: Mirror the `postImplementCommand` implementation exactly — `execFile('/bin/sh', ['-c', cmd], { timeout, cwd })`.

**Rationale**: `postImplementCommand` already works in production. The startup command is the same concept scoped to a per-repo level instead of globally. Consistency reduces cognitive overhead.

**Relevant code** (`src/daemon/stage-executor.js:260-277`):
```js
if (config.postImplementCommand) {
  try {
    const { stdout } = await execFileAsync('/bin/sh', ['-c', config.postImplementCommand], {
      timeout: 30000,
      cwd: job.repo_path,
    });
    await postIssueComment(octokit, job.github_repo, job.issue_number,
      `✅ **Post-implement hook completed**:\n\`\`\`\n${(stdout || '').trim()}\n\`\`\``
    ).catch(() => {});
  } catch (err) { ... }
}
```

**Alternatives considered**: `spawn` with streaming — rejected; adds complexity with no benefit for a short-lived startup script. `execFile` with captured output is the right tool.

---

## 2. Timeout Value

**Decision**: 5 minutes (300,000 ms) default. Not configurable in this iteration.

**Rationale**: Spec SC-001 specifies 5 minutes. `docker compose up -d --build` on a cold cache can take 2-4 minutes. 5 min is a safe ceiling that won't frustrate users while still preventing indefinite hangs.

**Alternatives considered**: 30s (too short for docker builds), configurable (deferred to future iteration per spec assumptions).

---

## 3. Output Truncation

**Decision**: Capture combined stdout+stderr; include last 50 lines in issue comment.

**Rationale**: Spec assumption explicitly states 50 lines to avoid oversized issue comments. `execFile` buffers combined output; split on `\n`, take last 50 lines.

**Implementation**:
```js
const lines = (output || '').split('\n');
const snippet = lines.slice(-50).join('\n').trim();
```

**Alternatives considered**: First 50 lines — rejected; tail of output is most useful for diagnosing failures. Streaming to comment — rejected; creates comment spam.

---

## 4. Per-Repo vs Global Execution Order

**Decision**: Per-repo `startupCommand` runs AFTER the global `postImplementCommand`.

**Rationale**: Spec assumption states: "The global `postImplementCommand` config field (if set) runs in addition to the per-repo `startupCommand`; the per-repo command runs after the global one." This preserves the existing global hook without change.

**Execution sequence**:
1. Implement stage completes
2. `markComplete(db, job.id)`
3. Global `postImplementCommand` (if set) — existing behaviour, unchanged
4. Per-repo `startupCommand` (if set) — new

---

## 5. Config Schema Extension

**Decision**: Add optional `startupCommand` string field to each repo entry object.

**Current repo entry shape**:
```json
{ "repo": "owner/name", "localPath": "/path/to/repo" }
```

**New shape**:
```json
{ "repo": "owner/name", "localPath": "/path/to/repo", "startupCommand": "docker compose up -d --build" }
```

**Rationale**: Minimal change; `startupCommand` absent = undefined = falsy = skip (backward compatible).

**readConfig default**: No explicit default needed — `undefined` is the correct "not set" signal; falsy check `if (repoConfig.startupCommand)` handles absence cleanly.

---

## 6. CLI Flag Design (`cockpit repos add`)

**Decision**: `--startup-command <cmd>` optional flag on `cockpit repos add`.

**Current signature**: `repoAdd(configDir, repoName, localPath, logger)`
**New signature**: `repoAdd(configDir, repoName, localPath, options = {}, logger)`
where `options = { startupCommand }`.

**Rationale**: Named options object is more extensible than positional params; consistent with Node.js convention for optional param bags.

**Update path**: If repo already exists, `--startup-command` updates the existing entry's field (FR-009 update scenario from spec). Current code returns early on existing repo — change to allow update-in-place.

**CLI invocation** (spec SC-004):
```
cockpit repos add owner/repo /local/path --startup-command "docker compose up -d --build"
```

---

## 7. Issue Comment Format

**Decision**: Match the existing `postImplementCommand` comment style.

**Success**:
```
✅ **Startup command completed**:
```
docker compose up -d --build
...last 50 lines of output...
```
```

**Failure**:
```
⚠️ **Startup command failed** (exit 1):
```
...last 50 lines of stderr/output...
```
```

**Rationale**: Consistent with existing hook comments; users already recognise this pattern. Spec SC-005 requires user to determine outcome within 30s from comment — the emoji + bold label achieves this.

---

## 8. Test Strategy

**Existing test patterns** (`test/unit/stage-executor.test.js`): Uses `node:test`, mock functions, no real child processes. Tests call `executeJob` with stub functions.

**New tests needed**:
- `stage-executor`: startup command runs after implement, skipped when absent, failure reported, timeout enforced
- `repos`: `--startup-command` stored on add, existing repo updated when flag provided
- `config`: `startupCommand` absent → undefined (no default injection)

**Approach**: Inject a mock `execFileAsync` via dependency injection pattern or module-level override (consistent with existing tests).
