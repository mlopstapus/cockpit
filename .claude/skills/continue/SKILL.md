# Continue Work

Resume existing work based on PLAN.md status.

## Quick Reference
- **Reads:** PLAN.md status
- **Calls:** /plan or /implement (based on status)
- **Updates:** Restores database, transitions phases
- **Duration:** Instant routing + phase execution
- **Token budget:** 5-10k for routing + phase budget

## Usage
```bash
/continue
```

## Steps

1. **Check for PLAN.md**
   - If not found: "No active work. Use `/new` to start."
   - If found: Read status

2. **Route based on status**

   **CRITICAL:** Do NOT skip to implementation! MUST call the appropriate skill:

   - **📋 Planning** → CALL Skill("/plan") → feedback loop → auto `/implement`
   - **🔨 Implementing** → CALL Skill("/implement") → feedback loop → ✅ Ready to Ship
   - **✅ Ready to Ship** → Tell user: "Run `/finish` to ship"
   - **🚢 Shipped** → Show PR URL, suggest `/new` for next work
   - **⏸️ Paused** → CALL appropriate skill (plan or implement) based on what was paused

   This routing enables autonomous session resume in the Orchestration Engine.

## Use Cases

**After pulling main:**
```bash
git pull origin main
/continue  # Resumes work
```

**Forgot where you left off:**
```bash
/continue  # Reads status, picks up automatically
```

**Interrupted mid-phase:**
```bash
/continue  # Resumes planning or implementation
```

**Session crashed or rate-limited:**
```bash
/continue  # Autonomous resume with full context restoration
```

## Notes

- Smart routing based on PLAN.md status
- Idempotent (can run multiple times safely)
- No manual status tracking needed
- Auto-transitions between phases
- Enables durable execution across sessions (Orchestration Engine feature)
