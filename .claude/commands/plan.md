# Plan

Plan a feature or initiative before any code is written. The output is a structured plan saved to `PLAN.md` in the repo root. Walk through each step one at a time, asking before proceeding to the next.

Your job ends when the plan is written and approved. Do NOT write code, branch, commit, or push — tell them to run `/feature` or `/fix` when they're ready to execute.

## Steps (in order, one at a time)

1. **Understand the goal** — Ask what they want to build or change and why. Get the user story or problem statement clear before moving on.
2. **Explore the codebase** — Read the relevant existing code, models, config, and services to understand what exists today. Share what you found.
3. **Identify scope** — Break the work into discrete tasks. For each task, note:
   - What changes (files, components, endpoints, services)
   - Dependencies on other tasks
   - Any open questions or decisions needed
4. **Check constraints** — Review against project architecture:
   - Does it need new backend services? (new files in `backend/services/`)
   - Does it need new API endpoints? (new routes in `backend/routers/`)
   - Does it touch WebSocket streaming? (changes to `backend/ws/hub.py`)
   - Does it need new frontend components? (files in `frontend/src/components/`)
   - Does it affect the PWA manifest or service worker?
   - Does it change the account rotation strategy?
5. **Confirm the plan** — Present the full plan for review. Incorporate any feedback.
6. **Write PLAN.md** — Save the approved plan to `PLAN.md` in the repo root using the format below.

## PLAN.md Format

```markdown
# Plan: [Feature/Initiative Title]

**Status:** Planning | In Progress | Complete
**Created:** [date]

## Goal

[1-2 sentence description of what we're building and why]

## Tasks

- [ ] Task 1 — description
  - Files: `path/to/file`
  - Notes: any context
- [ ] Task 2 — description
  - Depends on: Task 1
  - Files: `path/to/file`

## Architecture Notes

- [ ] New API endpoints: [list]
- [ ] New services: [list]
- [ ] WebSocket changes: [yes/no]
- [ ] Frontend components: [list]
- [ ] Config changes: [list]

## Open Questions

- [Any unresolved decisions or unknowns]
```

7. **Next steps** — Tell the user: **Run `/feature` or `/fix` to start executing. Check off tasks in `PLAN.md` as you go. Delete `PLAN.md` when the work is complete and merged.**

## Key Rules
- No code during planning. This is a thinking exercise.
- Every task should be small enough to fit in a single commit.
- If the plan has more than 10 tasks, consider splitting into multiple plans/PRs.
- The plan is a living document: update it as you execute, delete it when done.
