# New Feature

Build a new feature in Claude Cockpit. Run autonomously — read the code, follow existing patterns, and implement. Only stop if requirements are genuinely ambiguous.

## Steps

1. **Scope** — Confirm what the feature does, which layer it touches (backend FastAPI, frontend React, or both), and what the acceptance criteria are. If any of this is unclear, ask before touching code.
2. **Branch** — Pull latest main and create a branch:
   ```
   git checkout main && git pull origin main
   git checkout -b feature/<short-description>
   ```
3. **Read first** — Find and read the relevant existing code before writing anything. Follow existing patterns — don't invent new ones.
4. **Implement** — Write the code. Dockerfiles automatically pick up changes.
   - **Backend (FastAPI):**
     - Follow the router → model → service pattern. Routes in `backend/routers/`, models in `backend/models.py`, services in `backend/services/`.
     - Use proper HTTP methods and status codes.
     - Endpoint paths should be noun-based (`/api/sessions`, `/api/repos`).
     - Return consistent JSON response shapes using Pydantic models.
     - WebSocket endpoints in `main.py`, streaming through `backend/ws/hub.py`.
     - Config in `backend/config.py` reads from `DATABASE_URL` environment variable (PostgreSQL).
   - **Frontend (React + TypeScript + Tailwind):**
     - Components in `frontend/src/components/`.
     - Hooks in `frontend/src/hooks/`.
     - API methods in `frontend/src/lib/api.ts`.
     - Types in `frontend/src/types/index.ts`.
     - Mobile-first PWA design — test in iPhone viewport.
     - Use Tailwind. Dark basecolor `#0a0a0a`.
   - If both layers: implement backend first, test with `/test`, then frontend.

When done: **Run `/test` to verify, then `/commit` to ship.**

## Rules
- Never commit directly to `main`.
- New config values go in `backend/config.py`.
- Frontend must work as PWA — test standalone mode.
- WebSocket messages follow `WSMessage` contract in `backend/models.py`.
- Account rotation stays in `backend/services/account_rotator.py`.
- Process management stays in `backend/services/claude_process.py`.
- Database uses PostgreSQL (via `DATABASE_URL` in docker-compose.yml).
