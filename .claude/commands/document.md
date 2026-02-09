# Document Changes

Run `git diff` first. Add documentation only where genuinely needed. Keep everything concise — one sentence where possible. Match existing style: `#` comments in Python, `//` in TypeScript. No docstrings unless they already exist in the file.

## Inline documentation

### API routes
Every route in `backend/routers/` gets a one-line `#` comment above the handler if it's new or changed. Update it if you changed what an existing route does.

### Non-obvious logic
One `#` comment explaining WHY, only if a future engineer would need context. Skip anything the variable names and types already explain.

### WebSocket/PTY logic
If you changed anything in `backend/services/claude_process.py` or `backend/ws/hub.py`, add a brief comment explaining the flow — PTY and async streaming are the trickiest parts of this codebase.

### Config changes
New config values go in `backend/config.py` with a comment explaining what they control.

## Feature log
If on a `feature/` branch:

1. Run `git branch` to confirm and get the description from the branch name.
2. Check if a doc already exists in `docs/features/` for this feature.
3. **If it exists** — update it with what changed.
4. **If it doesn't exist** — create `docs/features/YYYY-MM-DD-<description>.md`.

Three sections max:
- **What it does** — one or two sentences on the purpose
- **How it works** — new routes, services, components, config
- **Setup** — only if there are new config values or manual steps

## Fix log
If on a `fix/` branch:

1. Create `docs/fixes/YYYY-MM-DD-<description>.md`.

Three sections:
- **What broke** — the bug and how to reproduce it
- **Root cause** — why it was broken
- **What changed** — which files were modified and what the fix was

## What NOT to do
- Don't comment self-explanatory code
- Don't add docstrings where none exist
- Don't touch docs for code you didn't change
- Keep it short — if a section would be more than two or three sentences, cut it down
