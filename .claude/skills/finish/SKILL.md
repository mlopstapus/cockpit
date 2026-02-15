# Finish and Ship

Complete work with quality checks and PR creation.

## Quick Reference
- **Replaces:** /commit
- **Calls:** /document → /clean → /ralph
- **Updates:** PLAN.md status → 🚢 Shipped
- **Duration:** 10-20min (mostly automated)
- **Token budget:** 5-15k typical

## Usage
```bash
/finish
```

Run after `/new` or `/continue` completes and PLAN.md status is ✅ Ready to Ship.

**CRITICAL: Auto-pushes and updates PR if all checks pass. No confirmation needed.**

## Steps

### 1. Verify ready to ship
- **CRITICAL:** Ensure you're in project root (run `pwd` and verify, navigate if needed)
- Check PLAN.md status must be ✅ Ready to Ship
- If not: "Run `/continue` to complete implementation"

### 2. Quality checks **BEFORE COMMIT** (blocking gates)
- **Lint:** Run lint checks for both frontend and backend - **must pass or STOP**
  - Frontend: `cd frontend && npm run lint` (or `npx tsc --noEmit`)
  - Backend: `cd backend && ruff check .` or `pylint` (Python linting)
- **Documentation:** Run `/document` (inline comments, feature logs)
- **Cleanup:** Run `/clean` (remove unused files, archive PLAN.md)

### 3. Review changes (before commit)
- Run `git diff --stat` and `git diff` in parallel
- Check for secrets (hardcoded credentials)
- Check for temp scripts/tools that shouldn't be committed
- Show summary to user

### 4. Commit + Push + PR
**First, check if changes are already committed:**
- Run `git status` to check for uncommitted changes
- If working tree is clean: Skip to push step (commit already exists)
- If changes exist: Create commit as shown below
Summarize changes in plain English, then:

**IMPORTANT:** Run git commands from project root (check with `pwd`, use `cd /path/to/project` if needed)

```bash
# Verify not on main, stage files, commit
git branch --show-current | grep -v "^main$" && \
git add <file1> <file2> && \
git commit -m "$(cat <<'EOF'
<commit message>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

# Push and create/update PR automatically
git push && \
(gh pr list --head $(git branch --show-current) --json number,url --jq '.url' || \
 gh pr create --base main --title "<title>" --body "<body>")
```

Never `git add .`. Never stage `.env` or secrets. Use conventional commit format.

### 5. Update PLAN.md
- Set status: 🚢 Shipped
- Add commit hash, PR URL, timestamp

### 6. Continuous improvement
- Run `/ralph` skill
- Analyze session for inefficiencies
- Update skill files with improvements
- Document learnings in memory

### 7. Confirm
Tell user: "Shipped! PR: <url>"

## Notes

- All quality checks must pass before shipping
- Auto-pushes (no confirmation prompts)
- `/ralph` runs automatically for continuous improvement (Orchestration Engine optimization)
- `/clean` archives PLAN.md to docs/archive/
- Autonomous PR creation - ready for human review and merge
