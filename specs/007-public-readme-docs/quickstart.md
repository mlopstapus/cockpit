# Implementation Quickstart: 007-public-readme-docs

**Date**: 2026-03-25

## What to build

Three files:
1. **`README.md`** (update in place) — the main deliverable
2. **`CONTRIBUTING.md`** (create) — contributor guide
3. **`LICENSE`** (exists, MIT) — no changes needed

## What the current README is missing

Compare current `README.md` against spec requirements:

| Section | Current State | Action |
|---------|--------------|--------|
| Title + license badge | Title only | Add MIT badge |
| Prerequisites | ✅ Present | No change |
| Quick Start | ✅ Present | No change |
| How It Works | ✅ Present | No change |
| Architecture | Bullet list only | Add ASCII flow diagram |
| Security & Trust callout | ❌ Missing | Add `> [!NOTE]` block (FR-011) |
| CLI Reference | Missing `jobs`, missing `-f` on `logs` | Add both |
| Configuration | ✅ Present | No change |
| Issue Naming | ✅ Present | No change |
| Q&A | ❌ Missing | Add 8 Q&A entries (FR-005) |
| Troubleshooting | ❌ Missing | Add 5 entries (FR-006) |
| Development | ✅ Present | No change |
| Contributing pointer | ❌ Missing | Add one-liner + link (FR-014) |
| Tone | Mixed | Light first-person pass |

## Implementation order

1. Add license badge to title line
2. Add `jobs` command and `-f` flag to CLI section
3. Add ASCII flow diagram to Architecture section
4. Add Security & Trust callout block after Architecture
5. Add Q&A section (8 entries) after Issue Naming
6. Add Troubleshooting section (5 entries) after Q&A
7. Add Contributing one-liner before or after Development
8. Light tone pass (no structural changes — just remove any "we" language)
9. Create `CONTRIBUTING.md`

## Key content references

- All CLI flags: `node src/cli/index.js --help` and subcommand `--help`
- Config fields: `CLAUDE.md` Configuration section
- Architecture: `CLAUDE.md` Architecture section
- Module list: `CLAUDE.md` Key Modules table

## Acceptance checklist (manual)

Before marking tasks done, verify each against the spec:

- [ ] FR-001: Overview ≤4 sentences, covers Issue→pipeline→PR flow
- [ ] FR-002: Prerequisites lists Node.js 18+, git, Claude Code CLI, PAT with `repo` scope
- [ ] FR-003: Quick Start has install + init + start + open issue
- [ ] FR-004: CLI section covers all 10 commands + key flags
- [ ] FR-005: Q&A has ≥6 entries, self-contained answers
- [ ] FR-006: Troubleshooting has ≥4 failure modes with resolution paths
- [ ] FR-007: No "we" language; tone is honest/technical
- [ ] FR-008: Architecture section has a flow diagram
- [ ] FR-009: All code blocks have language identifiers
- [ ] FR-010: Config section documents all fields
- [ ] FR-011: Security callout block present, covers 3–5 bullets
- [ ] FR-012: LICENSE exists (already satisfied)
- [ ] FR-013: CONTRIBUTING.md created with bug/feature/PR/local-setup sections
- [ ] FR-014: License badge in header; contributing pointer at bottom
