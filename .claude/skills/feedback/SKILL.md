# Feedback Collection

Internal feedback loop for quality gates.

## Quick Reference
- **Called by:** /plan, /implement
- **Options:** Approve | Request Changes | Stop
- **Purpose:** Quality gates - no skipping approval
- **Token budget:** 2-5k per iteration

## Usage

**Plan phase:**
```
Does this plan look complete and correct?

✅ Approve → Proceed to implementation
🔄 Request Changes → Update and loop
⏸️ Stop → Pause, resume with /continue
```

**Implementation phase:**
```
Is everything working as expected?

✅ Approve → Ready to ship (/finish)
🔄 Fix Issues → Continue iterating
⏸️ Stop → Pause, resume with /continue
```

## Steps

1. **Present content**
   - Plan: Show plan summary
   - Implementation: Show changes made

2. **Ask phase-specific question**
   - Plan: "Does this plan look complete and correct?"
   - Implementation: "Is everything working as expected?"

3. **Provide 3 options**
   - ✅ Approve | 🔄 Request Changes | ⏸️ Stop

4. **Capture response**
   - If changes: Ask "What specific changes are needed?"
   - If stop: Confirm pause

5. **Return to caller**
   - Caller handles loop/transition/pause

## Notes

- No skip option (quality gates enforced)
- Prevents proceeding without approval
- Reusable across phases
- Captures specific feedback for iteration
- Critical for autonomous execution: ensures human oversight at key decision points
- Part of Cockpit's safety model: autonomous execution stops at human approval gates
