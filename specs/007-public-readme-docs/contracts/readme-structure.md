# README Structure Contract

**Feature**: 007-public-readme-docs
**Date**: 2026-03-25

This document defines the required section order, heading levels, and minimum content requirements for `README.md`.

---

## Section Order (top to bottom)

| # | Heading | Level | Required | Notes |
|---|---------|-------|----------|-------|
| 1 | (Title + badge) | `# Cockpit` | ✅ | License badge inline with title or on next line |
| 2 | Tagline | — | ✅ | One-line description from `package.json` description field |
| 3 | Prerequisites | `## Prerequisites` | ✅ | FR-002: Node.js 18+, git, Claude Code CLI, GitHub PAT with `repo` scope |
| 4 | Quick Start | `## Quick Start` | ✅ | FR-003: install → init → start → open issue; non-interactive variant |
| 5 | How It Works | `## How It Works` | ✅ | FR-001: 5-step numbered list covering the full flow |
| 6 | Architecture | `## Architecture` | ✅ | FR-008: text/ASCII flow diagram + tech bullets |
| 7 | Security & Trust | (callout block inside Architecture or standalone after it) | ✅ | FR-011: `> [!NOTE]` admonition, 3–5 bullets |
| 8 | CLI Reference | `## CLI` | ✅ | FR-004: all 10 commands + key flags in fenced code block or table |
| 9 | Configuration | `## Configuration` | ✅ | FR-010: all config.json fields documented |
| 10 | Issue Naming | `## Issue Naming` | ✅ | Pattern + examples |
| 11 | Q&A | `## Q&A` | ✅ | FR-005: ≥6 questions as `### Question?` + answer pairs |
| 12 | Troubleshooting | `## Troubleshooting` | ✅ | FR-006: ≥4 failure modes with symptom → resolution |
| 13 | Development | `## Development` | ✅ | Clone, install, test, lint commands |
| 14 | Contributing | `## Contributing` | ✅ | FR-014: one-liner + link to CONTRIBUTING.md |

---

## Content Rules

- **Tone**: First-person where appropriate ("I built this...") — no "we" language
- **Badge**: MIT license badge only — no CI/npm/coverage badges
- **Code blocks**: All fenced with language identifier (`bash`, `json`, `text`)
- **No HTML**: No raw `<details>`, `<img>`, or other HTML tags
- **Links**: Only repo-relative links and the license badge shield URL

---

## CLI Reference Format

Fenced `text` block listing all commands:

```
cockpit init [--yes]                     Setup wizard
cockpit start                            Start the background daemon
cockpit stop                             Stop the background daemon
cockpit restart                          Restart the background daemon
cockpit status                           Show daemon health, active job, queue depth, repos
cockpit logs [job-id] [-n N] [-f]        Tail logs (daemon or specific job)
cockpit jobs [-n N]                      List recent jobs
cockpit repos list                       List watched repos
cockpit repos add <owner/repo> <path>    Add a repo to watch
cockpit repos remove <owner/repo>        Remove a repo
cockpit token                            Rotate the GitHub personal access token
```

---

## Security Callout Content (FR-011)

Must appear as a `> [!NOTE]` block and cover:

1. `--dangerously-skip-permissions` grants Claude Code full file-system and shell access within the local repo clone
2. Claude runs entirely on your machine — no cloud agent, no remote execution
3. Nothing leaves your machine except GitHub API calls (issue comments, PR creation)
4. Cockpit does not send your code to any third-party service beyond what Claude Code itself does
5. Review each PR before merging — you are the last gate

---

## CONTRIBUTING.md Structure

| Section | Content |
|---------|---------|
| Bug reports | Open a GitHub issue with steps to reproduce |
| Feature requests | Open a `[COCKPIT]` issue — Cockpit builds its own features |
| PR workflow | Fork → `###-short-name` branch → `npm test` passes → PR |
| Local setup | `npm install`, `npm test`, `npm run lint` |
| Code style | ESLint via `npm run lint`; no `--no-verify` commits |
