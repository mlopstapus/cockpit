# Implementation Phase

Execute plan with testing and feedback loops. Operates as Cockpit's Execution Engine.

## Quick Reference
- **Called by:** /new, /continue (after plan approved)
- **Calls:** /sync → /test → /feedback
- **Updates:** PLAN.md tasks, status → ✅ Ready to Ship
- **Duration:** 30min - 2hrs depending on complexity
- **Token budget:** 10-30k typical, 50k with errors

## Steps

1. **Sync with main**
   - Run `/sync` to update branch
   - Resolve conflicts if any

2. **Read PLAN.md**
   - Load tasks and dependencies
   - Set status: 🔨 Implementing

3. **For each task:**
   - **Pre-checks:** Verify env vars/dependencies exist
   - **Implement:** Read existing code, make minimal changes
   - **React components (.tsx files):** Before making changes, verify hooks placement:
     * All hooks (useState, useEffect, useCallback, useMemo) must be at top of component
     * No hooks after conditional returns or early exits
     * After changes, verify hooks ordering unchanged and all before first conditional return
   - **FastAPI endpoints:** Follow FastAPI best practices, use dependency injection
   - **Verify:** Run `/test`, check logs
   - **Mark complete:** Update PLAN.md with ✅

4. **Final verification**
   - Run `/test` one final time
   - Review all changes

5. **Call /feedback**
   - Ask: "Is everything working as expected?"
   - Options: Approve | Fix Issues | Stop

6. **Handle feedback**
   - **✅ Approved:** Status → ✅ Ready to Ship, tell user "Run `/finish`"
   - **🔄 Fix Issues:** Fix → `/test` → loop to step 5
   - **⏸️ Stop:** Status → ⏸️ Paused, tell user "Use `/continue`"

## Notes

- Sync first to prevent merge conflicts
- Verify prerequisites before writing code
- Test incrementally (not just at end)
- Loop until user verifies everything works
- Update PLAN.md for state tracking
- Autonomous execution: iterate until tests pass

**Execution Engine principles:**
- Bounded iteration (stop at reasonable limit)
- Test-driven: no commit until tests pass
- Minimal changes: only what's needed for the task
