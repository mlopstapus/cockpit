# Cockpit Autonomous Development System

A self-hosted system that converts feature ideas into fully implemented pull requests — autonomously.

## What It Does

**Input:** Feature idea from mobile interface
**Output:** Production-ready pull request with passing tests

**Process:**
1. Generates PRD and technical plan
2. Breaks work into dependency-aware task graph
3. Executes implementation autonomously via AI agents
4. Iterates until all tests pass
5. Opens fully documented pull request

**Human Authority:** System stops at PR creation. Human retains merge authority.

## Core Principles

- **Human defines intent. Machine executes.**
- **Stop at pull request. Never auto-merge.**
- **Durable execution.** Survives crashes and rate limits.
- **Git-native.** All work in isolated feature branches.
- **Safe by design.** Bounded iteration and rollback-aware.
- **Mobile-first** command interface.

## Architecture

### Four Core Engines

**1. Planning Engine**
- Generates PRD and technical design
- Creates task dependency graph (DAG)
- Defines test strategy and acceptance criteria
- Outputs structured JSON for deterministic execution

**2. Orchestration Engine (Ralph Loop)**
- Persistent background state machine
- Monitors task readiness and dispatches execution agents
- Detects failures and rate limits
- Rotates AI accounts and compacts context
- Manages full lifecycle: REQUESTED → PLANNING → EXECUTING → TESTING → FIXING → PR_OPENED

**3. Execution Engine**
- Task-focused AI executor
- Sandboxed to feature branch with bounded iteration
- Short-loop cycles: Implement → Test → Fix → Commit → Repeat
- Tests must pass before commit

**4. Context Management Engine**
- Prevents token collapse in long-running loops
- Compacts history into structured memory after N iterations
- Preserves active diffs, summarizes completed work
- Enables indefinite execution

## Safety & Governance

**Guardrails:**
- Execution limited to feature branches
- No force pushes, no auto-merge
- Tests must pass before commit
- Iteration caps per task
- File change size thresholds
- Replan triggers on repeated failure

**Human remains final authority at PR review.**

## Infrastructure

```
User (iPhone PWA)
  ↓
FastAPI Control Plane
  ↓
PostgreSQL (state persistence)
  ↓
Worker Service (Orchestrator)
  ↓
Claude CLI Execution (PTY managed)
  ↓
Git repository → Pull Request
```

**Networking:** Tailscale secure access
**Authentication:** Network-level ACL (no app-level auth)

## Tech Stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS
**Backend:** FastAPI, Python
**Testing:** pytest (backend), npm test (frontend)
**Linting:** ruff/pylint (Python), eslint/tsc (TypeScript)

## What Cockpit Is Not

- ❌ AI coding assistant
- ❌ Chat wrapper
- ❌ Git automation script
- ❌ CI bot

## What Cockpit Is

✅ **Self-hosted autonomous development system** with durable planning, execution, and orchestration.

✅ Combines strategic planning, background execution, multi-agent rotation, and mobile command control.

✅ **No existing consumer AI product offers autonomous background feature completion to PR.**

## Strategic Value

Cockpit represents a new category: **Autonomous Development Infrastructure**

It transforms feature ideation into structured, background-executed engineering output.

- **The human defines what.**
- **The system determines how.**
- **The AI executes.**
- **The human approves.**

This preserves control while eliminating execution overhead.

## Implementation Roadmap

See [FEATURES.md](FEATURES.md) for detailed feature breakdown, engine mapping, dependencies, and status tracking.
