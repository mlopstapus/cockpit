# New Work

Entry point for all new autonomous feature work in Cockpit.

## Quick Reference
- **Replaces:** /new-feature, /new-fix, /refactor
- **Calls:** /plan → /implement
- **Guides to:** /finish
- **Duration:** 30min - 2hrs depending on complexity
- **Token budget:** 20-40k typical

## Usage
```bash
/new "Brief description"
```

**Examples:**
- `/new "Add session pause/resume to orchestrator"`
- `/new "Fix task dependency resolution bug"`
- `/new "Refactor planning engine to use structured JSON output"`

## Steps

1. **Parse & clarify**
   - Understand what needs to be built/fixed/refactored
   - Ask clarifying questions if unclear
   - **CRITICAL: Determine scope**
     * Permanent code change (new feature, refactor, bug fix) → Proceed with workflow
     * One-time fix (temp script, data fix) → **Do NOT commit temp tools**
       - Run the fix, commit only the result
       - Delete temp scripts/tools after use
   - Determine branch type: feature/, fix/, or refactor/

2. **Check for existing work**
   - If PLAN.md exists: Ask "Continue or start fresh?"
     * Continue → Use `/continue` instead
     * Start fresh → Proceed

3. **Setup**
   ```bash
   git checkout main && git pull origin main
   git checkout -b <type>/<description>
   ```

4. **Planning phase** → Call `/plan`
   - Creates PLAN.md (📋 Planning)
   - Calls /feedback loop until approved
   - Sets status → 🔨 Implementing
   - Returns when approved

5. **Implementation phase** → Call `/implement`
   - Syncs with main
   - Executes plan tasks
   - Calls /test + /feedback loop
   - Sets status → ✅ Ready to Ship
   - Returns when verified

6. **Tell user:** "Run `/finish` to ship"

## Fast Path

For simple changes (<3 files, clear scope):
- Brief planning (task list only)
- Quick yes/no feedback
- Standard /finish

## Notes

- Quality gates: plan approval required, implementation verification required
- User explicitly runs /finish (not automatic)
- Focus on autonomous execution patterns
