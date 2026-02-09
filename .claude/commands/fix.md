# Bug Fix

Fix a bug in Claude Cockpit. Run autonomously — locate, diagnose, and fix. Only stop if the root cause is ambiguous.

## Steps

1. **Reproduce** — Understand the bug and how to trigger it. Start services if needed:
   ```
   docker-compose up -d
   ```
   Do not touch code until you can articulate what's wrong.

2. **Branch** — Create a new branch unless the user confirms this is part of active work and that work should be done in the same branch.
   ```
   git checkout main && git pull origin main
   git checkout -b fix/<short-description>
   ```

3. **Find it** — Locate the relevant code. Read it before changing anything.

4. **Root cause** — Identify WHY it's broken. State it before writing a fix.

5. **Fix** — Make the minimal change needed. Do not refactor or clean up surrounding code.

6. **Best Practice Validation:**
   - **Backend:** Verify HTTP status codes, WebSocket message contracts, and session/account rotation logic remain sound. Ensure error messages are clear.
   - **Frontend:** Test in PWA standalone mode. Verify WebSocket reconnection. Check mobile viewport.

7. **Test locally** — If relevant:
   ```
   docker-compose build <service>
   docker-compose up -d
   docker-compose logs -f api frontend
   ```

When done: **Run `/test` to verify the fix, then `/commit` to ship.**

## Rules
- Minimal changes only. A bug fix is not a refactor.
- Never commit directly to `main`.
- If the bug is in PTY/process management (`claude_process.py`), verify fix doesn't leak file descriptors.
- If the bug is in WebSocket streaming, verify listeners are properly cleaned up.
- Don't change API response shapes to fix a bug — that's a new feature.
- If Docker-related, rebuild images before testing: `docker-compose build <service>`.
- Use `docker-compose logs` to debug service issues.
