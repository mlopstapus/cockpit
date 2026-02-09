# Sync

Sync the current branch with main. Pull latest main, rebase, and resolve any conflicts. Run autonomously — read the code, understand both sides, and resolve. Only stop and ask if a conflict is genuinely ambiguous (e.g. one side deletes something the other side modified).

## Steps

1. **Check state** — Run `git status` and `git branch`. Confirm you are NOT on `main`. If there are uncommitted changes, stash them: `git stash`.
2. **Check for stuck rebase** — Run `git status` for signs of an in-progress rebase. If one is stuck, abort it first: `git rebase --abort`.
3. **Fetch main** — Run `git fetch origin main`.
4. **Rebase** — Run `git rebase origin/main`.
5. **Resolve conflicts** — If conflicts appear, for each conflicted file:
   - Read the full file to understand the context around the conflict markers (`<<<<<<< HEAD` is the current branch, `>>>>>>> origin/main` is main).
   - Resolve using the guidelines below.
   - Stage the file: `git add <file>`
   - Continue: `git rebase --continue`
   - Repeat until the rebase completes.
6. **Verify** — Run `git log --oneline -5` to confirm the rebased history looks clean. Run `git status` to confirm a clean working tree.
7. **Restore stash** — If you stashed in step 1, run `git stash pop`. Resolve any conflicts from the pop the same way.
8. **Push** — If the branch has a remote tracking branch (`git branch -vv`), run `git push --force-with-lease`. If the branch has never been pushed, skip this — the next `/commit` will handle the initial push.

## Conflict resolution guidelines

- **Both sides touch different parts of the same file** — keep both changes. Remove the conflict markers and leave all code intact.
- **Both sides modify the same function or block** — merge the logic so both changes are present. The current branch's change is the feature or fix in progress; main's change is whatever shipped since the branch was created. Both are intentional.
- **One side adds code, the other deletes it** — stop and ask. This is the one case where guessing can silently break things.
- **Import or dependency conflicts** — keep both imports/deps unless they are exact duplicates.
- **Never silently drop code from either side.** If unsure, ask.

## Rules
- Never run this on `main`.
- Always use `--force-with-lease`, never bare `--force`. It fails safely if someone else pushed to the branch.
- If something goes sideways mid-rebase, abort cleanly with `git rebase --abort` and report back.
