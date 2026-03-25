# Research: Detailed PR Review Response Comments

**Branch**: `009-detailed-pr-responses` | **Date**: 2026-03-25

## Decision Log

### 1. Summary extraction mechanism

**Decision**: Instruct Claude to conclude its implementation response with a `## Changes Made` markdown heading followed by one bullet per addressed review comment. Extract this section by regex after `runClaude()` returns.

**Rationale**: The prompt already controls Claude's output. Adding a structured section at the end is minimal overhead, produces deterministic parse targets, and requires no second API call or new infrastructure. A regex match on `## Changes Made` is robust against variation in surrounding prose.

**Extraction regex**:
```
/## Changes Made\n([\s\S]*?)(?:\n## |\n# |$)/
```
Captures everything after the heading through the next top-level heading or end of string.

**Alternatives considered**:
- Second Claude call for summarisation → extra latency, extra cost, unnecessary.
- Heuristic parsing of raw output → fragile; depends on Claude output format staying consistent.

---

### 2. Comment format

**Decision**: Structure the success comment as:

```
✅ **Changes pushed to branch**

### What was addressed
<one bullet per original review comment (quoted or paraphrased)>

### What was changed
<extracted "Changes Made" section from Claude output verbatim>
```

The "What was addressed" section is drawn from `comment_body` (already stored in the PR review job). The "What was changed" section is the extracted Claude summary.

**Rationale**: Cleanly separates "here's what was requested" (reviewer's original words) from "here's what was done" (Claude's implementation narrative). A reviewer can scan both without leaving the PR.

**Alternatives considered**:
- Single merged section → less scannable; mixes reviewer intent with implementation description.
- Collapsible `<details>` for original comments → adds friction for the common single-comment case; not warranted.

---

### 3. Fallback handling

**Decision**: If the `## Changes Made` section is absent or empty after extraction:
1. Post `✅ **Changes pushed to branch**\n\n*No summary available.*\n\n**Review comments addressed:**\n<comment_body verbatim>`
2. Log a warning but do not fail the job.

**Rationale**: Git push succeeded; the code change is real. Silently dropping to a bare "Changes pushed" message loses context the reviewer already had (the review comment itself). Surfacing the original comment_body is always useful.

---

### 4. Prompt modification

**Decision**: Append to the existing Claude implementation prompt:

```
At the end of your response, include a section headed exactly:

## Changes Made

List one bullet for each review comment you addressed, describing concisely what you changed. Do not include file names or line numbers — focus on what was wrong and what you fixed.
```

Appended after the existing `\n\nOnce you are done, make sure to recompile...` suffix so the recompile instruction stays last in intent but the summary instruction is explicit.

**Alternatives considered**:
- Prepend the instruction → Claude may forget by the time it finishes; appending is closer to the output boundary.
- Place it mid-prompt → same concern.

---

### 5. Comment length guard

**Decision**: If the assembled comment exceeds 8,000 characters, truncate the "What was changed" section with a trailing `… (truncated)` note. The "What was addressed" section is preserved in full since it comes directly from the reviewer.

**Rationale**: GitHub hard limit is 65,536 characters; 8,000 is a generous practical ceiling that covers any realistic PR review batch while preventing pathological cases.
