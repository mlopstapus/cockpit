# Commit

The code is written and tested. Document, review, and ship — autonomously.

## Steps

1. **Document** — Run `/document`. It handles inline comments and feature/fix logs.
2. **Debug cleanup** — Scan the diff for `print()`, `breakpoint()`, `debugger`, `console.log` (unless intentional), or commented-out test code. Remove it.
3. **Lint check** — For Python changes:
   ```
   cd backend && python -m py_compile <changed_file>.py
   ```
   For TypeScript changes:
   ```
   cd frontend && npx tsc --noEmit
   ```
4. **Docker cleanup** — Ensure no dangling references or stale docker images in your changes (no hardcoded ports, image names, etc.)
5. **Review** — Run `git diff` to see all changes. Confirm nothing unexpected is included. No Docker secrets, `.env` files with real passwords, or credential files.
6. **Branch check** — Confirm you are NOT on `main`. Run `git branch` to verify.
7. **Stage** — Add only the relevant files with `git add <file>`. Never `git add .`. Never stage `.env` or anything with secrets.
8. **Commit** — Conventional prefix required: `feat:`, `fix:`, `docs:`, `refactor:`, etc. Write a concise message: what changed and why.
9. **Push** — First push on this branch: `git push -u origin <branch>`. After that: `git push`.
10. **PR** — Check if a PR exists for this branch: `gh pr list --head <branch>`. If not, create one against `main`. Include a summary of what changed and why. Never merge without review.

## Rules
- Never `git add .`. Stage files explicitly.
- Never stage `.env`, `.docker/`, or files containing secrets/credentials.
- Conventional commits are not optional.
- Never merge directly to `main`.
- If you changed Dockerfiles or docker-compose.yml, mention in PR for manual testing instructions.
- Don't commit `.env` — it's in .gitignore for a reason.
