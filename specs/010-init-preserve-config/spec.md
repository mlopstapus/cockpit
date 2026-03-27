# Feature Specification: Init Preserve Config

**Feature Branch**: `010-init-preserve-config`
**Created**: 2026-03-25
**Status**: Draft
**Input**: User description: "cockpit init preserve values: When a user runs cockpit init on an existing config it should have options to overwrite existing configs or just hit enter and have the same config used as before. Like how when you run aws configure it shows the old values and for sensitive values it shows a preview and you have the option to keep it or enter a new values and overwrite it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Re-run Init to Update a Single Field (Priority: P1)

A user has Cockpit installed and working but needs to rotate their GitHub token. They run `cockpit init` and are shown each configuration field with the current value pre-filled. They press Enter to keep all existing values, but type a new token when they reach the token prompt. Only the token changes; everything else stays intact.

**Why this priority**: This is the primary pain point. Today, a user re-running init must retype all values to change one. Pre-filling values with the option to keep them solves this immediately and is the core of the feature.

**Independent Test**: Can be fully tested by running `cockpit init` against an existing config, pressing Enter on all prompts except one, and verifying the final config file matches the original except for the changed field.

**Acceptance Scenarios**:

1. **Given** a valid config exists, **When** the user runs `cockpit init` interactively, **Then** each prompt displays the current value so the user can press Enter to keep it or type to replace it.
2. **Given** the user presses Enter on all prompts without typing, **When** the wizard completes, **Then** the resulting config is identical to the original.
3. **Given** the user types a new value for one field, **When** the wizard completes, **Then** only that field is updated in the config.

---

### User Story 2 - Sensitive Value Masking with Keep-or-Replace (Priority: P2)

A user runs `cockpit init` and reaches the GitHub token prompt. Instead of showing the full token, the prompt displays a masked preview (e.g., `ghp_***...abc`) indicating a token is already stored. The user can press Enter to keep the existing token, or type a new one to replace it.

**Why this priority**: Sensitive values must not be echoed in plain text. The masking pattern (show prefix/suffix hint, allow keep-or-replace) matches established CLI conventions (e.g., `aws configure`) and is essential for security-conscious users.

**Independent Test**: Can be fully tested by inspecting the prompt text when a token already exists — it must display a hint (not the full token), and pressing Enter must leave the stored token unchanged.

**Acceptance Scenarios**:

1. **Given** a GitHub token is already configured, **When** the token prompt appears, **Then** the prompt shows a masked hint (e.g., `ghp_***...abcd`, showing at most 4 characters of the suffix) rather than the full token.
2. **Given** the masked token prompt is shown, **When** the user presses Enter without typing, **Then** the existing token is preserved unchanged.
3. **Given** the masked token prompt is shown, **When** the user types a new token value, **Then** the new token replaces the old one in the config.

---

### User Story 3 - Existing Repos Preserved with Option to Add More (Priority: P3)

A user re-runs `cockpit init` and already has two repos configured. The wizard shows the existing repos and allows them to add additional repos. They should not be forced to re-enter repos that are already correctly configured. Repo removal is handled separately via `cockpit repos remove`.

**Why this priority**: Repos are the most tedious part to re-enter (each requires a name, local path, and possibly a clone step). Preserving them by default prevents data loss and saves significant time.

**Independent Test**: Can be tested by running `cockpit init` with existing repos configured, skipping all changes, and verifying the resulting config has the same repos list.

**Acceptance Scenarios**:

1. **Given** repos are already configured, **When** the wizard runs, **Then** the wizard prints a summary list of existing repos (repo name and local path) as informational output, then asks "Add another repo?" — existing repos are preserved without requiring per-repo confirmation.
2. **Given** the user wants to add a new repo, **When** prompted whether to add another repo, **Then** the new repo is appended to the existing list.
3. **Given** the user wants to remove a repo, **When** they need to do so, **Then** they use `cockpit repos remove <owner/repo>` (repo removal is out of scope for the init wizard).

---

### Edge Cases

- What happens when the existing config file is malformed JSON? The wizard should warn the user and fall back to a blank/fresh setup rather than crashing.
- What happens when a field in the existing config has a value that fails validation (e.g., a local repo path that no longer exists)? **Out of scope for this feature.** Existing repos are preserved as-is in the summary list; the existing warning for newly-added repo paths (already implemented) is sufficient. A dedicated validation pass over preserved repos is deferred.
- What happens when the user runs `cockpit init --yes` (non-interactive) with an existing config? Environment variables take precedence over stored values, same as today (no behavior change for `--yes` mode).
- What happens if the user cancels mid-wizard? No config changes should be written; the existing config is preserved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an existing config is detected, the interactive wizard MUST pre-populate each prompt with the current stored value so the user can keep it by pressing Enter.
- **FR-002**: For the GitHub token field, the wizard MUST display a masked hint (showing the first 4 and last 4 characters, e.g., `ghp_***...abcd`) rather than the full token value when a token already exists.
- **FR-003**: The user MUST be able to press Enter at any prompt to keep the existing value without typing anything.
- **FR-004**: When the user types a new value at any prompt, that value MUST replace the previously stored value in the resulting config.
- **FR-005**: Existing repos MUST be preserved by default; the wizard MUST print a summary list of existing repos (repo name and local path) as informational output before asking "Add another repo?", rather than restarting from an empty list. Repo removal is out of scope for the init wizard — users should use `cockpit repos remove`.
- **FR-006**: If the existing config file cannot be parsed, the wizard MUST warn the user and proceed with a fresh setup rather than exiting with an error.
- **FR-007**: If the user cancels the wizard at any point, the existing config file MUST remain unmodified.
- **FR-008**: The `--yes` (non-interactive) mode MUST continue to read entirely from environment variables, ignoring any stored config values (no behavior change).
- **FR-009**: The current "Existing config found. Update it?" yes/no gate MUST be removed; the wizard should go directly into pre-filled prompts when an existing config is present.

### Key Entities

- **Config**: The stored configuration at `~/.cockpit/config.json` — contains `githubToken`, `githubOwner`, `pollIntervalSeconds`, `postImplementCommand`, and `repos` array.
- **Sensitive field**: A config field whose value must not be displayed in plain text (currently: `githubToken`).
- **Masked hint**: A display-safe representation of a sensitive value showing enough characters to confirm identity without revealing the secret (e.g., last 4 chars of a token).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user re-running `cockpit init` to change one field can complete the wizard in under 30 seconds by pressing Enter for all unchanged fields.
- **SC-002**: The GitHub token is never displayed in plaintext during the interactive wizard when a token already exists.
- **SC-003**: After pressing Enter on every prompt without typing, the resulting config file is functionally identical to the pre-existing config.
- **SC-004**: Cancelling the wizard at any point leaves the existing config file unmodified.
- **SC-005**: Running `cockpit init --yes` with environment variables produces the same behavior as before this change (no regression in non-interactive mode).

## Clarifications

### Session 2026-03-25

- Q: What mechanism should the init wizard use to allow removal of existing repos? → A: Repo removal is out of scope for the init wizard; users should use `cockpit repos remove`.
- Q: Should `--yes` mode fall back to stored config values for any missing env vars? → A: No — `--yes` mode remains strict; all required env vars must be present and no fallback to stored config occurs.
- Q: How are existing repos presented during init re-run? → A: Print a summary list of existing repos as informational output (e.g., `• myuser/myrepo → /home/user/repos/myrepo`), then ask "Add another repo?"

## Assumptions

- The `pollIntervalSeconds` and `postImplementCommand` fields are not sensitive and can be shown as plain-text defaults.
- Only `githubToken` is treated as a sensitive field requiring masking; `githubOwner` is not sensitive and can be shown in full.
- The masking hint format (showing last 4 characters) is sufficient to identify which token is stored without revealing the secret; this matches how AWS CLI handles `aws_secret_access_key`.
- Repo entries are printed as a summary list (repo name + local path) before the "Add another repo?" prompt so the user can see what is already configured without any per-repo interaction required.
- The constitution prompts (per-repo) follow the same pre-fill pattern if previously provided; if not previously configured, they behave as today.
