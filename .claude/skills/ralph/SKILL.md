# Ralph - Session Review & Orchestration Loop Optimization

**Philosophy:** Iteration beats perfection. Review the current session, identify inefficiencies, improve skills, and apply lessons learned. Named after Cockpit's Orchestration Engine (Ralph Loop), this skill embodies continuous improvement of autonomous execution.

## Steps (in order)

### 1. Session Analysis
Review the conversation transcript (use Grep on session .jsonl file if needed):
- What tasks were attempted?
- How many iterations did each task require?
- What caused the iterations (bugs, unclear requirements, missing context)?
- Which commands/skills were used and how effective were they?
- What patterns of token usage emerged?
- **Check for PLAN.md**: If the session involved complex multi-step work (multiple files, multiple phases, investigation required) but no PLAN.md exists, create one documenting the approach taken

### 2. Identify Pain Points
Find specific issues that slowed progress:
- Commands that were confusing or incomplete
- Missing verification steps that caused rework
- Unclear error messages that required investigation
- Redundant tool calls or unnecessary context loading
- Skills that were invoked multiple times for the same issue

### 3. Calculate Token Impact
Estimate token waste from:
- Repeated file reads (same file read multiple times)
- Failed operations requiring retry
- Large diffs displayed unnecessarily
- Context that could have been skipped

### 4. Skill Improvements
For each skill file in `.claude/skills/`:
- Does it need clearer instructions?
- Should it include verification steps?
- Could it be more concise?
- Should it reference other skills in a better order?
- Does it align with autonomous execution principles (iterate until verifiable goal)?
- Does it support the Planning/Execution/Orchestration engine model?

### 5. Apply Improvements
**ACTION REQUIRED:** Actually edit skill files using the Edit tool:
- Read each skill file that needs improvement
- Use Edit tool to add verification steps, clarify instructions, improve ordering
- Make changes specific and actionable
- Test that changes don't break the skill structure
- Focus on high-impact improvements first

### 6. Document Learnings
**ACTION REQUIRED:** Update memory files using Edit or Write tools:
- Add patterns to `.claude/MEMORY.md` in the repo
- This is version-controlled and visible to the team
- Include concrete examples, not just abstract principles
- Tag learnings by category (Database, Frontend, API, Debugging, etc.)
- Keep each entry 1-3 sentences max

## Key Principles

**Verification First**: Every command should verify its work before declaring success
- After migration → verify with query
- After code change → run tests
- After API change → check endpoint responds

**Fail Fast**: Catch issues early with explicit checks
- Check prerequisites before starting
- Validate inputs before proceeding
- Test incrementally, not all at once

**Minimize Rework**: Learn from iteration patterns
- If a command required 3 tries → add verification step
- If an error was unclear → improve error handling
- If context was missing → add it to command prompt

**Token Efficiency**: Reduce unnecessary work
- Use `--stat` before full diff
- Read specific lines instead of full files
- Use Grep instead of Read for searches
- Batch independent operations in parallel

**Ralph Technique**: Iterate until complete
- Define verifiable goal upfront
- Check progress after each step
- Loop back if goal not met
- Stop only when goal is achieved

## Output Format

Present findings as:

```
## Session Review: [Brief Description]

**Tasks Completed:** [List with iteration counts]
**Total Iterations:** X
**Primary Bottlenecks:** [Top 3 issues]

**Token Analysis:**
- Session tokens used: X
- Estimated waste: Y (Z%)
- Main sources: [List]

**Skill Improvements:**

### /skill-name
**Issue:** [What went wrong]
**Fix:** [Specific change to make]
**Impact:** [Expected improvement]

[Repeat for each skill]

**Memory Updates:**
- [Lesson learned #1]
- [Lesson learned #2]

**Next Session:** [Recommendations for similar tasks]
```

## When to Run This

- End of complex multi-iteration sessions
- After encountering unexpected blockers
- When noticing repeated patterns of rework
- Before starting similar tasks (review past ralph outputs)
- Weekly for active projects

## Success Criteria

This skill succeeds when:
- ✅ All pain points from session are documented
- ✅ Skill files actually edited with improvements (not just suggested)
- ✅ Token waste quantified and mitigation suggested
- ✅ Learnings written to memory files
- ✅ Summary of changes provided to user

## Workflow

1. **Analyze** - Review session, identify issues
2. **Prioritize** - Pick top 3 skills to improve
3. **Edit** - Use Edit tool to update skill files
4. **Document** - Use Edit/Write to update memory
5. **Report** - Show user what was changed and why

## Orchestration Loop Connection

This skill embodies the Cockpit Orchestration Engine's continuous improvement cycle:
- Monitor execution (session analysis)
- Detect inefficiencies (pain points)
- Optimize process (improve skills)
- Persist learnings (update memory)
- Iterate (apply to future sessions)
