# Implementation Plan: Detailed PR Review Response Comments

**Branch**: `009-detailed-pr-responses` | **Date**: 2026-03-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-detailed-pr-responses/spec.md`

## Summary

Enrich the success comment posted after a PR review job completes. Currently the comment reads only "✅ Changes pushed to branch". The new comment will include a "What was addressed" section (drawn from the stored review comment text) and a "What was changed" section (extracted from a structured `## Changes Made` block that Claude is instructed to append to its implementation response). No schema changes are required; all data is available in the existing `pr_review_jobs` row and Claude's stdout.

## Technical Context

**Language/Version**: Node.js 18+ ESM
**Primary Dependencies**: `better-sqlite3`, `@octokit/rest`, `commander@12`, `node-pty`, `chalk` (all existing)
**Storage**: SQLite via `better-sqlite3` (`~/.cockpit/cockpit.db`) — no changes
**Testing**: `node:test` (built-in)
**Target Platform**: macOS / Linux (developer host machine)
**Project Type**: CLI + background daemon
**Performance Goals**: No change — success comment is posted after git push; minor additional string processing is negligible
**Constraints**: GitHub comment body ≤ 65,536 characters; soft truncation at 8,000 characters applied
**Scale/Scope**: One PR review job at a time (FIFO queue)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Question | Status |
|-----------|--------------|--------|
| I. Trust-Based Collaboration | Changes are on feature branch `009-detailed-pr-responses`. All agent actions are logged. No project-specific behaviour hardcoded — prompt instruction is generic. | ✅ |
| II. Thorough Change Review | Feature delivered as a PR with session logs available. | ✅ |
| III. Security First | No new external input surfaces. `comment_body` is sanitised at intake in `src/github/pr-watcher.js:sanitise()` (control characters stripped). It is now surfaced in two additional places (Claude prompt + GitHub success comment body) but the existing sanitisation is sufficient; no additional controls needed. No new secrets. | ✅ |
| IV. Test-Driven Implementation | Tests updated/added for: prompt modification, summary extraction, comment assembly, fallback path. | ✅ |
| V. Dev Box Execution Model | Host-OS execution; no containerisation. No new post-implement hooks. | ✅ |
| VI. Always Self-Reflect | Assumptions verified against code (no schema change confirmed). Side-effects on adjacent modules checked (only `pr-review-executor.js` and its test file touched). | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/009-detailed-pr-responses/
├── plan.md              # This file
├── research.md          # Phase 0 complete
├── data-model.md        # Phase 1 complete
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (changes required)

```text
src/daemon/pr-review-executor.js   ← only file changed
test/unit/pr-review-executor.test.js    ← tests updated/extended
```

No new files. No new dependencies. No contracts directory needed (no external interface changes).

## Implementation Design

### 1. Prompt modification (`pr-review-executor.js`)

Append the following to the existing Claude prompt string in `executePrReview`:

```
\n\nAt the end of your response, include a section headed exactly:\n\n## Changes Made\n\nList one bullet for each review comment you addressed, describing concisely what you changed. Do not include file names or line numbers — focus on what was wrong and what you fixed.
```

The `recompile and redeploy` instruction is already appended by the caller in `stage-executor.js`. This feature only touches `pr-review-executor.js` where the prompt is assembled directly.

### 2. Summary extraction

Add a pure function `extractChangesSection(output)`:

```
- Input: Claude's full stdout string
- Regex: /## Changes Made\n([\s\S]*?)(?=\n## |\n# |$)/
- Returns: trimmed matched group, or empty string if not found
```

### 3. Comment assembly

Add a pure function `buildSuccessComment(commentBody, changesSection)`:

```
- commentBody: the stored review comment text (comment_body field)
- changesSection: output of extractChangesSection (may be empty)
- Returns: formatted markdown string

Happy path:
  ✅ **Changes pushed to branch**

  ### What was addressed
  <commentBody, blockquoted>

  ### What was changed
  <changesSection verbatim>

Fallback (changesSection empty):
  ✅ **Changes pushed to branch**

  ### What was addressed
  <commentBody, blockquoted>

  *No changes summary was generated.*

Length guard: if assembled string > 8000 chars, truncate changesSection with "… (truncated)"
```

### 4. Wire-up in `executePrReview`

After `runClaude()` resolves successfully, before `gitPush()`:
1. Call `extractChangesSection(claudeOutput)` on the resolved output
2. Store `changesSection` in a local variable

After `gitPush()` succeeds, replace the existing hardcoded `✅ Changes pushed to branch` string with `buildSuccessComment(review.comment_body, changesSection)`.

If `runClaude()` throws (existing error path), changesSection is unavailable — that path already posts a failure comment and returns early, so no change needed there.

## Test Plan

All tests use `node:test`. Extend `test/unit/pr-review-executor.test.js`:

| Test | What it verifies |
|---|---|
| `extractChangesSection` — section present | Returns content between `## Changes Made` and next heading |
| `extractChangesSection` — section absent | Returns empty string |
| `extractChangesSection` — section at end of string | Returns content through EOF |
| `buildSuccessComment` — with changesSection | Output contains "What was addressed", "What was changed", original comment text, changes content |
| `buildSuccessComment` — empty changesSection (fallback) | Output contains "What was addressed", original comment text, "No changes summary" note |
| `buildSuccessComment` — length guard | Output ≤ 8000 chars when changesSection is very long; contains truncation marker |
| `executePrReview` integration — success path | Posted success comment contains structured sections, not bare "Changes pushed to branch" |
| `executePrReview` integration — Claude output missing section | Falls back gracefully; job still marked complete |

## Complexity Tracking

No constitution violations. No complexity justification required.
