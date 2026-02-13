# Claude Cockpit

A self-hosted React PWA + FastAPI backend for managing multiple Claude Code agent sessions from your iPhone, running on an Intel NUC over Tailscale.

Cockpit Autonomous Feature Factory
Board-Level Vision & System Definition
Executive Summary

Cockpit is a self-hosted autonomous software development system that converts feature ideas into fully implemented pull requests — without human intervention during execution.

A user initiates a feature from a mobile interface. The system:

Generates a production-grade PRD and technical plan

Breaks the work into a dependency-aware task graph

Executes implementation autonomously via managed AI agents

Iterates until all tests pass

Opens a fully documented pull request

The system stops at PR creation. A human retains merge authority.

Cockpit transforms feature ideation into automated engineering throughput.

The Problem

Modern software development suffers from three bottlenecks:

Planning overhead — turning ideas into structured execution plans

Engineering bandwidth — implementing and testing features

Context switching — coordinating tools, environments, branches, and CI

Even senior engineers spend substantial time translating product ideas into structured execution before actual implementation begins.

Meanwhile, AI coding tools today are:

Interactive

Session-based

Short-lived

Context-fragile

Human-dependent

They assist engineers — they do not replace execution loops.

Cockpit eliminates execution as a manual activity.

The Solution

Cockpit is a background autonomous engineering engine with:

Strategic planning intelligence

Dependency-aware task orchestration

Multi-account rate limit management

Context compaction and persistence

Git-native execution

Mobile command interface

The user defines intent. The system delivers a pull request.

Core Design Principles

Human defines intent. Machine executes.

Stop at pull request. Never auto-merge.

Durable execution. Survives crashes and rate limits.

Git-native. All work occurs in isolated feature branches.

Safe by design. Bounded iteration and rollback-aware.

Mobile-first command surface.

System Architecture

Cockpit consists of four primary engines:

1. Planning Engine

Responsible for:

PRD generation

Technical architecture proposal

Task decomposition

Dependency graph creation

Test strategy

Rollback strategy

Risk identification

Definition of done

Output:
Structured JSON containing:

PRD

Technical design

Task DAG

Acceptance criteria

This creates deterministic execution input.

2. Orchestration Engine (Ralph Loop)

A persistent background state machine that:

Monitors task readiness

Dispatches execution agents

Detects failures

Detects rate limits

Rotates AI accounts

Compacts context

Persists execution checkpoints

Replans when necessary

This engine owns the lifecycle of a feature from planning to PR.

State Machine:

REQUESTED
→ PLANNING
→ TASK_GRAPH_READY
→ EXECUTING
→ TESTING
→ FIXING
→ READY_FOR_PR
→ PR_OPENED

3. Execution Engine (Reckless Mode)

A task-focused AI executor that:

Pulls task definition

Writes code

Runs tests

Fixes failures

Commits changes

Iterates until success

Execution is sandboxed to:

Feature branch

Bounded iteration count

Required test pass before commit

It operates in short-loop cycles:

Implement → Test → Fix → Commit → Repeat

4. Context Management Engine

Long-running AI loops fail without context discipline.

Cockpit introduces:

Working Context:

Active task

Modified files

Test output

Historical Context:

PRD summary

Completed task summaries

Architectural constraints

Compaction Protocol:

After N iterations, summarize work into structured memory

Replace full history with compressed representation

Preserve only active diffs

This enables indefinite execution without token collapse.

Differentiation

Cockpit is not:

An AI coding assistant

A chat wrapper

A Git automation script

A CI bot

Cockpit is:

A self-hosted autonomous development system with durable planning, execution, and orchestration.

It combines:

Strategic planning

Background execution

Multi-agent rotation

Mobile command control

No existing consumer AI product offers autonomous background feature completion to PR.

Safety & Governance

To prevent destructive behavior:

Execution limited to feature branches

No force pushes

No auto-merge

Tests must pass before commit

Iteration caps per task

File change size thresholds

Replan triggers on repeated failure

The human remains final authority at PR review.

Infrastructure Overview

User (iPhone PWA)
→ FastAPI Control Plane
→ PostgreSQL (state persistence)
→ Worker Service (Orchestrator)
→ Claude CLI Execution (PTY managed)
→ Git repository
→ Pull Request

Networking:
Tailscale secure access

Authentication:
Network-level ACL (no app-level auth)

Roadmap

Phase 1 – Planning Engine
Generate PRD and structured task DAG

Phase 2 – Single Task Executor
Autonomous implementation of isolated tasks

Phase 3 – Orchestrated DAG Execution
Dependency-aware parallel execution

Phase 4 – Durable Resume & Compaction
Crash recovery and token management

Phase 5 – Parallel Branch Execution
Independent DAG branches executed concurrently

Full System Prompt Definition

Below is the master system definition prompt that governs Cockpit’s behavior.

MASTER SYSTEM PROMPT – Cockpit Autonomous Engineering System

You are part of the Cockpit Autonomous Engineering System.

Your role is to act as a senior staff-level engineer operating inside a self-contained software repository.

You are not a conversational assistant.

You are a background execution agent tasked with delivering production-ready pull requests.

You must:

Operate deterministically

Follow structured output formats

Respect branch isolation

Pass all tests before committing

Stop at PR creation

You do not merge code.
You do not bypass tests.
You do not delete unrelated files.

PLANNING MODE PROMPT

You are operating in PLANNING MODE.

Given a feature request, generate:

Product Requirements Document

Technical Design Specification

Explicit Task Breakdown

Dependency Graph (DAG)

Test Plan

Rollback Plan

Risk Assessment

Definition of Done

Output format (JSON only):

{
"prd": "...",
"technical_design": "...",
"tasks": [
{
"id": "T1",
"description": "...",
"depends_on": []
}
],
"test_plan": "...",
"rollback_plan": "...",
"risks": "...",
"definition_of_done": "..."
}

Do not include commentary.
Do not include markdown.
Output must be valid JSON.

EXECUTION MODE PROMPT

You are operating in EXECUTION MODE.

You are implementing task: {TASK_ID}

You must:

Identify relevant files.

Modify code to satisfy task requirements.

Run tests.

Fix all failing tests.

Ensure linting passes.

Commit only when tests pass.

Rules:

Work only in current feature branch.

Never remove unrelated code.

Never commit failing tests.

Never stop until task is complete or iteration limit reached.

After each iteration, summarize progress in structured format:

{
"changes_made": "...",
"tests_status": "...",
"next_action": "..."
}

You operate autonomously.
You do not ask for human clarification.
You infer intent from PRD and task definition.

Stop only when tests pass and task is complete.

ORCHESTRATOR MODE PROMPT

You are monitoring execution progress.

If:

Tests repeatedly fail → Trigger replan.

Task exceeds iteration cap → Escalate to replanning.

Rate limit detected → Persist state and rotate account.

Execution completes → Mark task complete.

Maintain state consistency.

Never lose execution context.

Strategic Value

Cockpit represents a new category:

Autonomous Development Infrastructure

It transforms feature ideation into structured, background-executed engineering output.

The human defines what.
The system determines how.
The AI executes.
The human approves.

This preserves control while eliminating execution overhead.