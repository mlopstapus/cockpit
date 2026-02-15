# Plan Phase

Create implementation plan with feedback loop. Operates as Cockpit's Planning Engine.

## Quick Reference
- **Called by:** /new, /continue (when status is 📋)
- **Calls:** /feedback (loops until approved)
- **Updates:** PLAN.md status → 🔨 Implementing
- **Duration:** 15-45min depending on complexity
- **Token budget:** 5-15k typical, 20k for complex features

## Usage
Can be called directly for planning-only sessions, or automatically by `/new`.

## Steps

1. **Create or update PLAN.md**
   - If new: Create from template
   - If exists: Read current state
   - Set status: 📋 Planning

2. **Understand the goal**
   - Ask what they want to build/change and why
   - Get user story or problem statement clear
   - Confirm understanding before proceeding

3. **Explore the codebase**
   - Read relevant existing code, components, services, APIs
   - Understand current architecture (React PWA, FastAPI backend)
   - Share findings with user

4. **Identify scope**
   - Break work into discrete tasks (suitable for task DAG)
   - For each task note:
     * What changes (files, components, endpoints)
     * Dependencies on other tasks
     * Open questions or decisions needed

5. **Check constraints**
   - New FastAPI endpoints? (`backend/app/api/`)
   - New React components? (`frontend/src/components/`)
   - State management changes? (React hooks, context)
   - API client updates? (`frontend/src/services/`)
   - Database schema changes? (SQLAlchemy models)
   - Mobile PWA compatibility? (touch, offline, responsive)
   - Autonomous agent integration? (Planning/Execution/Orchestration engines)

6. **Consider macro**
   - Consider other parts of the architecture this may impact
   - Planning Engine, Orchestration Engine (Ralph Loop), Execution Engine
   - Make plans to mitigate risks and blast radius
   - Document affected services and components

7. **Write/update PLAN.md**
   - Include: PRD, technical design, task breakdown, dependencies
   - Format: Structured for autonomous execution
   - Keep status: 📋 Planning

8. **Call /feedback**
   - Show plan summary
   - Ask: "Does this plan look complete and correct?"
   - Options: Approve | Request Changes | Stop

9. **Handle feedback**
   - **✅ Approved:** Status → 🔨 Implementing, return to caller
   - **🔄 Request Changes:** Ask for specifics → update → loop to step 7
   - **⏸️ Stop:** Status → ⏸️ Paused, tell user "Use `/continue`"

## Notes

- No code during planning (thinking exercise only)
- Loops until user approves
- Plan quality gates implementation
- Small tasks (fit in single commit)
- Living document (updated during implementation)
- Aligns with Cockpit's autonomous Planning Engine architecture
