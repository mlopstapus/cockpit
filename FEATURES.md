# Cockpit Feature Roadmap

Detailed breakdown of implementation phases, mapped to engines with dependencies and status tracking.

## Status Legend

- 🔴 **Not Started** - Not yet implemented
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Complete** - Fully implemented and tested
- 🔵 **Blocked** - Waiting on dependencies

---

## Phase 1: Planning Engine

**Goal:** Generate PRD and structured task DAG from feature requests

### Features

| ID | Feature | Engine | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| P1.1 | PRD Generation | Planning | - | 🔴 | Given feature request, generate structured PRD with problem, solution, scope, and constraints |
| P1.2 | Technical Design Spec | Planning | P1.1 | 🔴 | Generate architecture proposal, file changes, API contracts, data models |
| P1.3 | Task Decomposition | Planning | P1.2 | 🔴 | Break design into discrete, implementable tasks (max 2-3 file changes per task) |
| P1.4 | Dependency Graph (DAG) | Planning | P1.3 | 🔴 | Create task dependency graph, identify parallel execution opportunities |
| P1.5 | Test Strategy | Planning | P1.3 | 🔴 | Define test plan per task (unit, integration, e2e), test data requirements |
| P1.6 | Rollback Strategy | Planning | P1.2 | 🔴 | Define rollback procedures, safe failure points, state recovery |
| P1.7 | Risk Assessment | Planning | P1.2 | 🔴 | Identify architectural risks, breaking changes, external dependencies |
| P1.8 | Definition of Done | Planning | P1.5 | 🔴 | Explicit acceptance criteria, test coverage requirements, linting rules |
| P1.9 | Structured JSON Output | Planning | P1.1-P1.8 | 🔴 | Valid JSON schema with all planning artifacts, no markdown or commentary |
| P1.10 | Planning API Endpoint | Orchestration | P1.9 | 🔴 | `POST /api/features/plan` accepts feature request, returns planning JSON |

**Engine Breakdown:**
- **Planning Engine:** P1.1-P1.9 (core planning logic)
- **Orchestration Engine:** P1.10 (API integration)

---

## Phase 2: Single Task Executor

**Goal:** Autonomous implementation of isolated tasks

### Features

| ID | Feature | Engine | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| E2.1 | Task Context Loader | Execution | P1.9 | 🔴 | Load task definition from DAG, extract requirements, dependencies, test plan |
| E2.2 | File Identification | Execution | E2.1 | 🔴 | Identify files to modify based on task definition, verify they exist |
| E2.3 | Code Implementation | Execution | E2.2 | 🔴 | Modify code to satisfy task requirements, maintain style consistency |
| E2.4 | Test Execution | Execution | E2.3 | 🔴 | Run relevant tests (unit, integration), capture stdout/stderr |
| E2.5 | Test Failure Analysis | Execution | E2.4 | 🔴 | Parse test failures, identify root cause, generate fix strategy |
| E2.6 | Iterative Fixing | Execution | E2.5 | 🔴 | Fix failing tests, re-run, repeat until pass (bounded by iteration cap) |
| E2.7 | Linting Validation | Execution | E2.4 | 🔴 | Run linters (ruff, eslint), auto-fix where possible, ensure pass |
| E2.8 | Git Commit | Execution | E2.4, E2.7 | 🔴 | Commit changes only when tests pass and linting succeeds |
| E2.9 | Iteration Cap Enforcement | Execution | E2.6 | 🔴 | Stop execution after N iterations (default 10), escalate to replanning |
| E2.10 | Progress Structured Output | Execution | E2.3-E2.6 | 🔴 | After each iteration: JSON with changes_made, tests_status, next_action |
| E2.11 | Execution API Endpoint | Orchestration | E2.8, E2.10 | 🔴 | `POST /api/tasks/{id}/execute` runs task, returns execution result |

**Engine Breakdown:**
- **Execution Engine:** E2.1-E2.10 (core execution logic)
- **Orchestration Engine:** E2.11 (API integration)

---

## Phase 3: Orchestrated DAG Execution

**Goal:** Dependency-aware parallel execution across task graph

### Features

| ID | Feature | Engine | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| O3.1 | State Machine Implementation | Orchestration | P1.10, E2.11 | 🔴 | Implement feature state: REQUESTED → PLANNING → TASK_GRAPH_READY → EXECUTING → TESTING → FIXING → READY_FOR_PR → PR_OPENED |
| O3.2 | Task Readiness Monitor | Orchestration | P1.4, O3.1 | 🔴 | Poll DAG, identify tasks with resolved dependencies, mark ready for execution |
| O3.3 | Execution Agent Dispatcher | Orchestration | O3.2, E2.11 | 🔴 | Dispatch execution agents for ready tasks, track active executions |
| O3.4 | Parallel Execution Manager | Orchestration | O3.3 | 🔴 | Execute independent DAG branches in parallel (up to N concurrent tasks) |
| O3.5 | Failure Detection | Orchestration | O3.3 | 🔴 | Detect task failures (test fail, iteration cap, timeout), halt dependent tasks |
| O3.6 | Replan Trigger | Orchestration | O3.5 | 🔴 | After repeated failure, trigger replanning mode (regenerate DAG or escalate) |
| O3.7 | Checkpoint Persistence | Orchestration | O3.1 | 🔴 | Persist state checkpoints to PostgreSQL after each task completion |
| O3.8 | Feature Status API | Orchestration | O3.1 | 🔴 | `GET /api/features/{id}/status` returns current state, completed tasks, active tasks |
| O3.9 | Task Cancellation | Orchestration | O3.3 | 🔴 | `POST /api/features/{id}/cancel` stops execution, cleans up active agents |
| O3.10 | PR Creation Trigger | Orchestration | O3.1 | 🔴 | When all tasks complete, transition to READY_FOR_PR, trigger PR creation workflow |

**Engine Breakdown:**
- **Orchestration Engine:** O3.1-O3.10 (full orchestration logic)

---

## Phase 4: Durable Resume & Context Compaction

**Goal:** Crash recovery and token management for indefinite execution

### Features

| ID | Feature | Engine | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| C4.1 | Rate Limit Detection | Context | E2.4 | 🔴 | Detect Claude API rate limit errors (429), capture state before failure |
| C4.2 | Execution State Persistence | Context | O3.7, C4.1 | 🔴 | Persist full execution context to PostgreSQL: active task, file diffs, test output |
| C4.3 | Multi-Account Management | Context | C4.1 | 🔴 | Manage pool of Claude API accounts, track usage and rate limits per account |
| C4.4 | Account Rotation | Context | C4.3 | 🔴 | On rate limit, rotate to next available account, resume execution from checkpoint |
| C4.5 | Context Compaction Protocol | Context | E2.10 | 🔴 | After N iterations, summarize work into structured memory (completed tasks, key decisions) |
| C4.6 | History Compression | Context | C4.5 | �4 | Replace full chat history with compressed representation, preserve only active diffs |
| C4.7 | Working Context Manager | Context | C4.5 | 🔴 | Maintain active context: current task, modified files, recent test output |
| C4.8 | Historical Context Manager | Context | C4.5 | 🔴 | Maintain historical context: PRD summary, completed task summaries, architectural constraints |
| C4.9 | Crash Recovery | Context | C4.2 | 🔴 | On system crash/restart, load last checkpoint and resume execution |
| C4.10 | Resume API Endpoint | Orchestration | C4.9 | 🔴 | `POST /api/features/{id}/resume` resumes execution from last checkpoint |

**Engine Breakdown:**
- **Context Management Engine:** C4.1-C4.9 (context and durability logic)
- **Orchestration Engine:** C4.10 (API integration)

---

## Phase 5: Parallel Branch Execution

**Goal:** Execute independent DAG branches concurrently across multiple feature branches

### Features

| ID | Feature | Engine | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| M5.1 | Branch Isolation Manager | Orchestration | O3.4 | 🔴 | Create separate feature branches for independent DAG sub-graphs |
| M5.2 | Parallel Branch Executor | Orchestration | M5.1, O3.4 | 🔴 | Execute independent branches in parallel (e.g., frontend + backend simultaneously) |
| M5.3 | Branch Merge Strategy | Orchestration | M5.2 | 🔴 | Define merge order for branches (e.g., backend before frontend), detect conflicts |
| M5.4 | Conflict Detection | Orchestration | M5.3 | 🔴 | Detect merge conflicts between parallel branches, trigger resolution workflow |
| M5.5 | Conflict Resolution | Orchestration | M5.4 | 🔴 | Autonomous conflict resolution using PRD constraints, or escalate to human |
| M5.6 | Multi-Branch PR Creation | Orchestration | M5.3, O3.10 | 🔴 | Create single PR merging all branches, or separate PRs per branch with dependencies |
| M5.7 | Resource Limit Enforcement | Orchestration | M5.2 | 🔴 | Limit concurrent branches (prevent overwhelming NUC), queue additional work |
| M5.8 | Cross-Branch Test Validation | Execution | M5.3 | 🔴 | Run integration tests across merged branches before PR creation |

**Engine Breakdown:**
- **Orchestration Engine:** M5.1-M5.7 (parallel branch management)
- **Execution Engine:** M5.8 (cross-branch testing)

---

## Dependency Graph (High-Level)

```
Phase 1 (Planning Engine)
  ↓
Phase 2 (Single Task Executor)
  ↓
Phase 3 (Orchestrated DAG Execution)
  ↓
Phase 4 (Durable Resume & Context Compaction) ← Can be built in parallel with Phase 3
  ↓
Phase 5 (Parallel Branch Execution)
```

**Critical Path:**
1. Phase 1 must complete before any execution
2. Phase 2 must complete before orchestration
3. Phase 3 must complete before parallel branch execution
4. Phase 4 can be built alongside Phase 3 (orthogonal concerns)

---

## Implementation Priority

### Must-Have (MVP)
- **Phase 1:** Planning Engine (P1.1-P1.10)
- **Phase 2:** Single Task Executor (E2.1-E2.11)
- **Phase 3:** Orchestrated DAG Execution (O3.1-O3.10)

### Should-Have (Production-Ready)
- **Phase 4:** Durable Resume & Context Compaction (C4.1-C4.10)

### Nice-to-Have (Scale)
- **Phase 5:** Parallel Branch Execution (M5.1-M5.8)

---

## Feature Summary by Engine

| Engine | Total Features | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|---|
| **Planning Engine** | 9 | 9 | 0 | 0 | 0 | 0 |
| **Execution Engine** | 11 | 0 | 10 | 0 | 0 | 1 |
| **Orchestration Engine** | 16 | 1 | 1 | 10 | 1 | 7 |
| **Context Management Engine** | 9 | 0 | 0 | 0 | 9 | 0 |
| **Total** | **45** | **10** | **11** | **10** | **10** | **8** |

---

## Next Steps

1. **Start with Phase 1:** Implement Planning Engine features P1.1-P1.10
2. **Validate Planning Output:** Ensure JSON schema is deterministic and complete
3. **Build Execution Foundation:** Implement Phase 2 features E2.1-E2.11 for single-task execution
4. **Orchestrate:** Implement Phase 3 features O3.1-O3.10 for full DAG execution
5. **Harden:** Add Phase 4 features C4.1-C4.10 for production durability
6. **Scale:** Add Phase 5 features M5.1-M5.8 for parallel branch execution

**Update this document as features are implemented and status changes.**
