# Clean

Clean up the codebase: remove unused files, organize documentation, archive completed plans, and run formatting/lint checks.

## Steps (in order)

1. **Identify unused files** — Look for temporary files, scratch files, or artifacts that aren't part of the project (e.g., `*.tmp`, `*.bak`, leftover test outputs, orphaned config files). Delete them after confirming they're not referenced.

2. **Archive completed plans** — Check `PLAN.md` in the project root:
   - If all tasks are checked off (status is complete/done), move it to `docs/archive/YYYY-MM-DD-<slug>-plan.md` using the plan's creation date and a kebab-case summary of its title.
   - If the plan is still in progress, leave it in place.
   - Follow existing archive convention (see `docs/archive/` for examples).

3. **Organize documentation** — Ensure documentation files are in the right places:
   - API/feature docs → `docs/`
   - Archived/completed plans → `docs/archive/`
   - No stray `.md` files in the project root (other than `README.md`, `CLAUDE.md`, `PLAN.md`, `QUICKSTART.md`, `CHANGELOG.md`).
   - Move misplaced docs to the correct location.

4. **Remove debug artifacts** — Scan for and remove:
   - Stray `console.log` or `debugger` statements in committed code (check `git diff` against main)
   - Commented-out code blocks that are no longer needed
   - Unused imports (check lint output)

5. **Run formatting and lint checks** — Check if lint was recently run in `/test`:
   - If `/test` just ran (same session), skip lint to avoid duplication
   - Otherwise, run lint checks:
     - Frontend: `cd frontend && npm run lint` (or `npx tsc --noEmit`)
     - Backend: `cd backend && ruff check .` or Python linter
   - Fix auto-fixable issues if possible (`--fix` flag where supported)
   - Report remaining issues that need manual attention

6. **Report** — Summarize what was cleaned, archived, moved, or fixed. List any issues that need manual attention.
