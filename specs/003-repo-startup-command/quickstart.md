# Quickstart: Repo Startup Commands

**Feature**: 003-repo-startup-command
**Date**: 2026-03-24

## For the Implementer

### What changes

| File | Change |
|------|--------|
| `src/config/index.js` | No default needed — `startupCommand` absent = undefined = skip |
| `src/cli/repos.js` | `repoAdd()` accepts options object with `startupCommand`; update-in-place when repo exists |
| `src/cli/index.js` | Wire `--startup-command` option on `repos add` command |
| `src/daemon/stage-executor.js` | Add `runStartupCommand()` after global `postImplementCommand` block |
| `test/unit/repos.test.js` | Tests for `--startup-command` add + update paths |
| `test/unit/stage-executor.test.js` | Tests for startup command run/skip/fail/timeout |
| `CLAUDE.md` | Update config table to document `startupCommand` repo field |

### Implementation order

1. **`src/cli/repos.js`** — update `repoAdd` signature; add update-in-place path
2. **`src/cli/index.js`** — add `--startup-command` option to `repos add` command
3. **`src/daemon/stage-executor.js`** — add `runStartupCommand()` function and call after `postImplementCommand`
4. **`CLAUDE.md`** — update config reference table
5. **Tests** — write/update unit tests for all changed modules

### Key implementation details

**`repoAdd` update-in-place**:
```js
// repos.js — when repo exists and startupCommand provided, update it
if (existing) {
  if (options.startupCommand !== undefined) {
    existing.startupCommand = options.startupCommand;
    writeConfig(configDir, config);
    log(`Updated ${repoName} startup command`);
  } else {
    warn(`Repo '${repoName}' is already configured.`);
  }
  return;
}
```

**`stage-executor.js` startup command block** (after existing `postImplementCommand` block):
```js
// Find repo config for this job
const repoConfig = (config.repos || []).find(r => r.repo === job.github_repo);
if (repoConfig?.startupCommand) {
  const startMs = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', repoConfig.startupCommand], {
      timeout: 5 * 60 * 1000,
      cwd: job.repo_path,
    });
    const output = [stdout, stderr].filter(Boolean).join('\n');
    const snippet = output.split('\n').slice(-50).join('\n').trim();
    const elapsedS = ((Date.now() - startMs) / 1000).toFixed(1);
    await postIssueComment(octokit, job.github_repo, job.issue_number,
      `✅ **Startup command completed** (${elapsedS}s):\n\`\`\`\n${snippet}\n\`\`\``
    ).catch(() => {});
  } catch (err) {
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
    const snippet = output.split('\n').slice(-50).join('\n').trim();
    await postIssueComment(octokit, job.github_repo, job.issue_number,
      `⚠️ **Startup command failed** (exit ${err.code || 'timeout'}):\n\`\`\`\n${snippet}\n\`\`\``
    ).catch(() => {});
  }
}
```

### Testing approach

Tests mock `execFileAsync` and `postIssueComment` using the existing pattern in `stage-executor.test.js`. Key test cases:

```
stage-executor:
  ✓ runs startup command after implement stage when configured
  ✓ skips startup command when not configured
  ✓ posts success comment with output snippet on exit 0
  ✓ posts failure comment with output snippet on non-zero exit
  ✓ posts failure comment on timeout
  ✓ does not mark job failed when startup command fails

repos:
  ✓ saves startupCommand on add
  ✓ updates startupCommand when repo already exists
  ✓ warns and exits when repo exists and no --startup-command given
  ✓ stores command with spaces and special chars intact
```
