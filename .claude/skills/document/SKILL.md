# Document Changes

Run `git diff` first. Add documentation only where genuinely needed. Keep everything concise — one sentence where possible. Match existing style: simple comments, no excessive documentation.

## Inline documentation

### API Routes
Every FastAPI route has a docstring. Add one for new routes, update it if you changed what an existing route does.
```python
@app.get("/api/sessions")
async def list_sessions():
    """List all active AI agent sessions."""
    ...
```

### React Components
Brief JSDoc comments for non-obvious props or complex logic:
```typescript
/**
 * Manages autonomous agent session lifecycle
 */
export function SessionManager({ sessionId }: SessionManagerProps) {
  ...
}
```

### Non-obvious logic
One comment explaining WHY, only if a future developer would need context. Skip anything the variable names and types already explain.

### Environment variables
New env vars go in `.env.example`. Placeholder value, short comment on what it's for.

## Feature log
If the current branch is a `feature/` branch:

1. Run `git branch` to confirm and get the description from the branch name.
2. Check if a doc already exists in `docs/features/` for this feature.
3. **If it exists** — update it. Add a new entry describing what changed.
4. **If it doesn't exist** — create `docs/features/YYYY-MM-DD-<description>.md` using today's date and the branch description.

The file should be concise — three sections max:
- **What it does** — purpose and how it's used (user perspective)
- **How it works** — key technical details (new routes, components, engines affected)
- **Setup** — only if there are new env vars or manual steps required

Focus on autonomous execution features:
- Planning Engine improvements
- Execution Engine capabilities
- Orchestration Engine (Ralph Loop) enhancements
- Mobile PWA interface changes

## Fix log
If the current branch is a `fix/` branch:

1. Run `git branch` to confirm and get the description from the branch name.
2. Create `docs/fixes/YYYY-MM-DD-<description>.md` using today's date and the branch description.

The file should be concise — three sections:
- **What broke** — the bug and how it was reproduced
- **Root cause** — why it was broken
- **What changed** — which files were modified and what the fix was

**See `/new-fix` command for example format.**

## Refactor log
If the current branch is a `refactor/` branch:

1. Run `git branch` to confirm and get the description from the branch name.
2. Create `docs/refactors/YYYY-MM-DD-<description>.md` using today's date and the branch description.

The file should be concise — three sections:
- **What changed** — what was replaced and what replaced it
- **Why** — the motivation for the refactor
- **Migration notes** — any breaking changes or manual steps required

**See `/refactor` command for example format.**

## Mobile interface documentation
If the feature adds mobile PWA interface capabilities:

**When to create:**
- New mobile screens or workflows
- Touch interactions or gestures
- Offline capabilities
- PWA-specific features (install prompts, notifications, etc.)

**What to include:**
1. **Overview** — What the mobile interface enables
2. **User flow** — Step-by-step from mobile device
3. **API integration** — Which endpoints are called
4. **Offline behavior** — What works without connectivity
5. **Installation** — PWA install instructions

Focus on autonomous feature factory mobile command interface.

## What NOT to do
- Don't comment self-explanatory code
- Don't use JSDoc
- Don't touch docs for code you didn't change
- Keep it short — if a section would be more than two or three sentences, cut it down
