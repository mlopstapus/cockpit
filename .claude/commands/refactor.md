# Refactor

Refactor code in Claude Cockpit. Run autonomously — map the surface, plan, and implement. Only stop if a change would alter external behavior (API contracts, WebSocket message types, frontend component props).

## Steps

1. **Goal** — Confirm what is being replaced, why, and what the end state looks like. If the scope is unclear, ask before touching code.
2. **Branch** —
   ```
   git checkout main && git pull origin main
   git checkout -b refactor/<short-description>
   ```
3. **Map the surface** — Find every file that touches the old code. Read each one. List the full impact before changing anything.
4. **Plan the swap** — Lay out exactly what changes in each file. No code yet — just the mapping. Flag if the scope is larger than expected.
5. **Best Practice Review:**
   - **Backend:** Ensure refactoring maintains consistent API endpoints, WebSocket message contracts, and Pydantic model shapes. Check that session management and account rotation logic remain clean.
   - **Frontend:** Verify the refactor maintains clean separation (hooks, components, lib, types). Ensure PWA functionality isn't broken. Check mobile-first responsive behavior.
6. **Implement** — Make changes file by file. Follow existing patterns. Do not add new abstractions or reorganize unrelated code. Keep the diff minimal and focused.
7. **Verify the seams** — After each file, check that imports, types, and interfaces still line up. Nothing should be left dangling.

When done: **Run `/test` to verify everything works, then `/commit` to ship.**

## Rules
- Refactor = swap, not rewrite. Keep the same structure and patterns. Only change what is necessary.
- Never commit directly to `main`.
- Don't change API response shapes or WebSocket message types during refactoring — that's a breaking change.
- Don't change the PTY/process management approach without explicit approval.
