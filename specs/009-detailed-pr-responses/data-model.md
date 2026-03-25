# Data Model: Detailed PR Review Response Comments

**Branch**: `009-detailed-pr-responses` | **Date**: 2026-03-25

## Summary

No new database tables or columns are required. All data needed for the enriched success comment is already available in the existing `pr_review_jobs` table and in Claude's runtime output.

## Existing Entities Used

### PR Review Job (existing — `pr_review_jobs` table)

| Field | Type | Used by this feature |
|---|---|---|
| `id` | TEXT (UUID) | Logging |
| `github_repo` | TEXT | Posting the success comment |
| `pr_number` | INTEGER | Posting the success comment |
| `repo_path` | TEXT | Claude execution working directory |
| `comment_body` | TEXT | **"What was addressed" section** of the enriched comment |
| `status` | TEXT | No change |

### Implementation Summary (runtime — not persisted)

Derived at job execution time from Claude's stdout output. Extracted via regex from the `## Changes Made` section appended to the end of the implementation response.

| Concept | Source | Lifetime |
|---|---|---|
| `changesSection` | Claude stdout, parsed by regex | In-memory, per-job execution only |
| Fallback flag | Boolean: whether extraction succeeded | In-memory, per-job execution only |

## No Schema Changes Required

The `comment_body` field already stores the raw review comment text. The implementation summary is ephemeral runtime data — there is no need to persist it since the success comment on GitHub becomes the durable record.
