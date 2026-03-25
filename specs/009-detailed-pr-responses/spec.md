# Feature Specification: Detailed PR Review Response Comments

**Feature Branch**: `009-detailed-pr-responses`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "PR comment responses: When Cockpit responds to a comment that is on a PR it just mentions that it is completed. However, I'd like to have more detail in the comment response other than just completed as to what was wrong and what was fixed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reviewer Gets Summary of Changes Made (Priority: P1)

A developer leaves review comments on a PR that Cockpit manages. After Cockpit processes those comments and pushes changes, the reviewer wants to know — without having to diff the branch — what was addressed and what was changed in response to their feedback.

**Why this priority**: This is the core request. The current "✅ Changes pushed to branch" message gives no useful information. Reviewers cannot quickly judge whether their comments were properly handled.

**Independent Test**: Can be tested end-to-end by submitting a PR comment batch and verifying the success response includes a structured summary of the original comments and the changes made.

**Acceptance Scenarios**:

1. **Given** one or more PR review comments are batched and Cockpit implements them successfully, **When** the success comment is posted, **Then** it includes a list of the original review comments that were addressed.
2. **Given** Claude successfully implements the requested changes, **When** the success comment is posted, **Then** it includes a human-readable description of what was changed in the code to address each comment.
3. **Given** the implementation summary is generated, **When** the comment is posted, **Then** it is formatted so a reviewer can quickly scan what was wrong and what was fixed, without needing to read a diff.

---

### User Story 2 - Reviewer Understands Partial or Multi-Comment Responses (Priority: P2)

When multiple PR review comments are batched together, the reviewer wants to see whether each individual comment was addressed, not just a single blanket "done" message.

**Why this priority**: Multiple comments in one batch are common; without per-comment attribution the reviewer has to cross-reference manually.

**Independent Test**: Submit two distinct review comments in one batch; verify the response comment references both items individually.

**Acceptance Scenarios**:

1. **Given** two or more review comments are batched, **When** the success comment is posted, **Then** each original comment is referenced in the summary with its corresponding change.
2. **Given** changes are implemented across multiple files, **When** the success comment is posted, **Then** the summary includes one bullet per review comment describing what was fixed, without requiring file attribution.

---

### Edge Cases

- What happens when Claude's output does not contain a clear summary (e.g., very short or unstructured output)? The comment should still post, falling back to a generic success message plus the raw comment list.
- What if the success comment body exceeds GitHub's maximum comment length? Truncate or summarise while preserving the most important information.
- What if git push succeeds but generating the summary fails? The success comment should still post (changes are real), with a note that the summary could not be generated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After successfully implementing PR review comments and pushing changes, the system MUST post a success comment that includes a structured summary rather than only "Changes pushed to branch." The acknowledgement comment (posted before implementation begins) is out of scope and MUST NOT be changed.
- **FR-002**: The success comment MUST list the review comments that were addressed (either quoted or paraphrased from the original batch).
- **FR-003**: The success comment MUST include a description of what was changed in the code to address those comments. The implementation prompt sent to Claude MUST instruct Claude to conclude its response with a structured "Changes Made" section; the system extracts that section and includes it verbatim in the success comment.
- **FR-004**: When multiple review comments are batched, the "Changes Made" section MUST contain one bullet per review comment describing what was done to address it. File-level attribution is not required.
- **FR-005**: If summary generation fails or produces no usable content, the system MUST fall back to posting a success comment that at minimum includes the original review comment text, so the reviewer still has context.
- **FR-006**: The success comment MUST contain two clearly labeled sections: one titled "What was addressed" (showing the original review feedback) and one titled "What was changed" (showing what was done). A reviewer MUST be able to locate both sections without reading prose narrative.

### Key Entities

- **PR Review Job**: A batched set of one or more human PR comments that Cockpit processes together; has a `comment_body` field containing the raw comment text.
- **Implementation Summary**: The structured description (derived from Claude's output) of what code changes were made in response to the review comments.
- **Success Comment**: The GitHub PR comment posted by Cockpit after changes are pushed; currently contains only "✅ Changes pushed to branch."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful PR review jobs result in a success comment that includes both the addressed review feedback and a description of changes made (not just a generic completion message).
- **SC-002**: A reviewer reading the success comment can identify what was changed without opening the diff. *(Manual acceptance test: user confirms the comment is self-explanatory after first real PR review cycle. Not automatically verifiable.)*
- **SC-003**: When multiple comments are batched, the summary references each distinct comment, so reviewers do not need to cross-reference the original conversation.
- **SC-004**: The fallback path (summary unavailable) still posts a useful comment within the same poll cycle as the git push, with no silent failures.

## Clarifications

### Session 2026-03-25

- Q: How should the implementation summary be generated? → A: Option A — Modify the implementation prompt to ask Claude to produce a structured "Changes Made" summary at the end of its response, then extract that section.
- Q: Should the acknowledgement comment also be enhanced? → A: Option A — Enhance success comment only; leave acknowledgement as-is.
- Q: What level of detail should the "Changes Made" summary include per file? → A: Option C — bullet per review comment with the fix described; no file attribution required.

## Assumptions

- The implementation prompt is modified to instruct Claude to end its response with a clearly delimited "Changes Made" section. Claude's output is parsed to extract this section; if the section is absent or empty, the fallback path (FR-005) applies.
- The success comment does not need to be perfect prose — a structured list of "issue → fix" items is sufficient.
- GitHub's comment length limit (65,536 characters) is unlikely to be hit in practice, but a soft truncation at a reasonable threshold (e.g., 8,000 characters) is acceptable.
- No new database columns or schema changes are required; the summary is generated at post time from data already available (comment_body and Claude's output).
