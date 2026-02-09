# Clean

Clean up the Claude Cockpit codebase. Remove dead code, unused imports, linting issues, and outdated documentation. Run autonomously — identify issues, fix them systematically, and verify everything still works.

## Steps

1. **Scope** — Confirm the cleanup target: entire repo, specific layer (backend/frontend), or specific modules.

2. **Branch** — Create a clean-up branch:
   ```
   git checkout main && git pull origin main
   git checkout -b chore/cleanup-<scope>
   ```

3. **Backend Code Cleanup** — If focusing on backend:
   - Run syntax checks:
     ```
     cd backend && python -m py_compile main.py config.py models.py
     ```
   - If `ruff` is installed, run `ruff check . --fix`.
   - If `black` is installed, run `black .`.
   - Remove unused imports using manual audit.
   - Identify dead code: unused functions, classes, endpoints. Search for usages before deleting.
   - Remove `print()` statements, TODO comments, and commented-out code. Remove or resolve.
   - Check for unused Pydantic models in `backend/models.py`.
   - Check for unused routes in `backend/routers/`.

4. **Frontend Code Cleanup** — If focusing on frontend:
   - Run TypeScript type checking:
     ```
     cd frontend && npx tsc --noEmit
     ```
   - Check for unused imports and dead code in `frontend/src/`.
   - Remove unused components, hooks, and types.
   - Fix linting issues:
     ```
     cd frontend && npm run lint -- --fix
     ```
   - Remove commented-out code and debug logging.

5. **Dependencies Cleanup**:
   - Backend: Review `backend/requirements.txt` for unused packages.
   - Frontend: Review `frontend/package.json` for unused packages.

6. **Verification**:
   - [ ] All Python files compile without errors.
   - [ ] Frontend builds without TypeScript errors.
   - [ ] No unused imports or variables.
   - [ ] No debug prints or commented-out code remain.

When done: **Run `/test` to verify everything works, then `/commit` to ship.**

## Rules
- Never commit directly to `main`.
- Before deleting code, search for all usages. If uncertain, ask before removing.
- Dead code removal should be atomic — one PR per layer unless scope is small.
- Don't refactor code as part of cleanup — that's a separate task.
- If cleanup reveals actual bugs, flag them as a separate bug fix.
