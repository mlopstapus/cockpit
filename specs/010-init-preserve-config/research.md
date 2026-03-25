# Research: Init Preserve Config

**Feature**: 010-init-preserve-config
**Date**: 2026-03-25

## Decision 1: Token Masking Prompt Type

**Decision**: Use a `password()` prompt for token entry in all cases (first run and re-run). When an existing token is detected, embed the masked hint in the prompt `message` string (e.g., `GitHub token [current: ghp_***...abcd, Enter to keep]:`). An empty submission is treated as "keep existing".

**Rationale**: `@clack/prompts` `password()` masks keystrokes while typing, which is correct for new token entry. It does not support `initialValue` (by design — pre-filling a password field would expose it in the terminal). The hint-in-message pattern matches `aws configure`'s approach for sensitive fields and is a well-established CLI convention.

**Alternatives considered**:
- `text()` prompt with placeholder: Would show the new token in plaintext as the user types. Rejected — the existing `password()` behavior (masked input) should be preserved for new token entry.
- Third-party prompt library: No new dependencies are warranted for this feature.

---

## Decision 2: Non-Sensitive Field Pre-filling

**Decision**: Use `@clack/prompts` `text()` prompt's existing `initialValue` option to pre-fill `githubOwner`, `pollIntervalSeconds`, and `postImplementCommand` with stored values.

**Rationale**: `initialValue` is already used in the codebase (e.g., `clonePath` prompt on line 321). It pre-fills the editable field so the user can press Enter to keep it or type to replace. No library changes needed.

**Alternatives considered**: None — this is the idiomatic @clack/prompts API.

---

## Decision 3: Repo Summary Display

**Decision**: Print a formatted summary of existing repos using `logger.log()` (or `@clack/prompts` `note()` if available) before the "Add another repo?" prompt. Format: `• owner/repo  →  /local/path` per line.

**Rationale**: Informational output (not an interactive prompt) is the right tool for showing a list. It doesn't require the user to interact with each repo, fulfilling FR-005. The `addMore` loop then starts immediately after the summary.

**Alternatives considered**:
- Per-repo confirmation prompts: Over-engineered; forces interaction for repos the user doesn't want to change.
- `@clack/prompts` `select()` for keep/replace: Adds complexity and is non-obvious UX for a list that doesn't change.

---

## Decision 4: Malformed Config Fallback

**Decision**: Wrap existing-config JSON.parse in a try/catch at the start of `collectConfigInteractive`. On failure, log a warning (`logger.warn('Config file unreadable — starting fresh setup')`) and proceed with `existing = null` (same as first-run path).

**Rationale**: The existing code (lines 272–277 in init.js) already has this try/catch for the initial load. We extend this to also set `existing = null` on parse failure rather than throwing. This matches the spec's edge case requirement (FR-006).

**Alternatives considered**: None — the current partial handling is correct; just needs `existing = null` on failure.

---

## Decision 5: Exported Pure Helpers

**Decision**: Extract and export `maskToken(token)` as a pure helper from `init.js`. This enables direct unit testing of the masking logic without mocking `@clack/prompts`.

**Rationale**: `collectConfigInteractive` is an async function that calls `@clack/prompts` directly and is not currently exported. Unit-testing it requires mocking the entire prompts library. Extracting the pure token-masking logic as a named export allows the critical security behavior (never showing full token) to be tested independently.

**Format**: `maskToken('ghp_abcdefghijklmnop')` → `'ghp_***...mnop'` (last 4 chars of suffix, `***` for middle).

---

## Decision 6: No New Dependencies

**Decision**: This feature requires no new npm packages.

**Rationale**: All required capabilities are available in the existing stack: `@clack/prompts` (interactive prompts with `initialValue`), `node:fs` (config read), and standard ESM patterns. Adding a dependency for a few lines of UX logic is unjustified.
