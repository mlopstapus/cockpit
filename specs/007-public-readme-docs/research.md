# Research: Public-Facing README and Documentation

**Feature**: 007-public-readme-docs
**Date**: 2026-03-25

## Overview

No NEEDS CLARIFICATION items exist in the Technical Context. All decisions are resolved from existing project files (`CLAUDE.md`, `package.json`, `src/cli/index.js`, existing `README.md`, `LICENSE`). This document records findings and decisions for traceability.

---

## Decision 1: README content source of truth

**Decision**: Use `CLAUDE.md` as the authoritative source for architecture, config fields, CLI commands, and design decisions. Use `src/cli/index.js --help` output to verify CLI command list.

**Rationale**: CLAUDE.md is maintained alongside the code and already contains accurate, up-to-date descriptions of all modules, config fields, and commands. No independent research needed.

**Alternatives considered**: Regenerating content from scratch — rejected because it risks drifting from actual behaviour.

---

## Decision 2: CLI commands to document

**Decision**: Document all 10 top-level commands: `init`, `daemon` (internal, note it's not for direct use), `start`, `stop`, `restart`, `status`, `logs`, `repos`, `jobs`, `token`. Include key flags: `init --yes`, `logs -n <N>`, `logs -f`, `jobs -n <N>`.

**Rationale**: `cockpit --help` returns 10 commands. The existing README omits `jobs` and the `-f` follow flag on `logs`. All must be present per FR-004 and SC-005.

**Alternatives considered**: Omitting `daemon` entirely — kept as a brief note ("internal, use `cockpit start` instead") to avoid user confusion if they encounter it.

---

## Decision 3: License file

**Decision**: LICENSE already exists (MIT, copyright 2026 Benjamin Anderson). No changes required.

**Rationale**: FR-012 requires a LICENSE file. It exists. FR-012 is already satisfied.

**Alternatives considered**: N/A.

---

## Decision 4: Architecture diagram format

**Decision**: Use a plain text/ASCII flow diagram in a fenced `text` code block.

**Rationale**: GitHub renders ASCII diagrams without plugins. Mermaid is supported on GitHub but requires ```` ```mermaid ```` fence — acceptable but adds a dependency. ASCII is universally portable.

**Alternatives considered**: Mermaid diagram — acceptable fallback if ASCII reads poorly; implementer may use either.

---

## Decision 5: Security callout placement

**Decision**: Place the security/trust callout block immediately after the Architecture section, as a `> [!NOTE]` GitHub admonition block.

**Rationale**: GitHub natively renders `> [!NOTE]`, `> [!WARNING]`, `> [!IMPORTANT]` as styled callout boxes. Placing it after Architecture gives it contextual grounding (the reader has just seen how Claude is invoked).

**Alternatives considered**: Inline in Quick Start — less visible; in a dedicated `## Security` section — too prominent for what is a reassurance note, not a threat model.

---

## Decision 6: Q&A topics (minimum 6 per FR-005)

The following 8 Q&A pairs are planned — exceeds the 6 minimum:

1. Does Cockpit cost money to use?
2. What platforms are supported?
3. What happens if the daemon crashes mid-job?
4. How do I add more repos without re-running init?
5. How do I answer clarification questions?
6. Will Cockpit auto-merge the PR it creates?
7. Can Cockpit run multiple jobs in parallel?
8. Does my code leave my machine?

**Rationale**: 8 covers the "is this right for me" questions plus the security question reinforced from the callout block.

---

## Decision 7: Troubleshooting topics (minimum 4 per FR-006)

The following 5 troubleshooting entries are planned:

1. Daemon not running / won't start
2. Issues not being picked up (polling, `githubOwner` mismatch, label filter)
3. Rate limit hit — what Cockpit does automatically and how to check status
4. Auth/token errors (PAT scope, expired token)
5. macOS: launchd not restarting after deploy (use `cockpit restart`)

**Rationale**: 5 covers all 4 required failure modes plus the macOS-specific launchd workaround noted in the spec edge cases.

---

## Decision 8: CONTRIBUTING.md scope

**Decision**: Cover bug reports, feature requests (use `[COCKPIT]` issues), PR workflow (fork → branch → `npm test` → PR), and local dev setup (`npm install`, `npm test`, `npm run lint`).

**Rationale**: FR-013 requirements. Kept minimal to avoid over-promising community support for a personal tool.
