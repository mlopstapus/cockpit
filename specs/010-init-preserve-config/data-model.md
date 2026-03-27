# Data Model: Init Preserve Config

**Feature**: 010-init-preserve-config
**Date**: 2026-03-25

## No Schema Changes

This feature makes no changes to `~/.cockpit/config.json` schema or the SQLite database. The Config entity structure is unchanged; only the wizard flow that reads and writes it is modified.

---

## Config Entity (unchanged schema, new read semantics)

**File**: `~/.cockpit/config.json`
**Mode**: chmod 600 (written by `writeConfig`)

| Field | Type | Sensitive | Pre-fill Behavior |
|-------|------|-----------|-------------------|
| `githubToken` | string | Yes | Show masked hint in prompt message; empty input = keep existing |
| `githubOwner` | string | No | Use as `initialValue` in text prompt |
| `pollIntervalSeconds` | number | No | Convert to string, use as `initialValue` in text prompt |
| `postImplementCommand` | string | No | Use as `initialValue` in text prompt |
| `repos` | array | No | Print as summary list; offer "Add another?" |

---

## maskToken Helper

**Input**: Full GitHub PAT string (any length, any prefix)
**Output**: Masked display string

**Format rule**:
- If token length ≤ 8: return `'***'` (too short to show suffix safely)
- Otherwise: `'{first 4 chars}***...{last 4 chars}'`
  - Example: `'ghp_abcdefghijklmnop'` → `'ghp_***...mnop'`
  - Example: `'github_pat_abc123xyz789'` → `'gith***...z789'`

**Validation**: Never reveals more than 8 characters total (4 prefix + 4 suffix). Used only in prompt message display; the actual token value is never rendered in the terminal input field.

---

## Repo Summary Format

When existing repos are present, print before the "Add another repo?" prompt:

```
Watched repos:
  • owner/repo-a  →  /home/user/repos/repo-a
  • owner/repo-b  →  /home/user/repos/repo-b
```

No data model change — this is a display-only transformation of the existing `repos[]` array.
