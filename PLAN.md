# Plan: Cockpit MVP - Mobile Feature Submission

**Status:** 📋 Planning
**Created:** 2026-02-15
**Architecture:** Simplified - Use `/new` skill workflow, not DAG execution

## Goal

Build mobile-first UI to submit feature requests from iPhone and monitor Claude Code `/new` workflow execution remotely.

**Core Insight:** Don't build a DAG execution engine. Just trigger the existing `/new` skill remotely and stream logs back to mobile.

---

## Key Decisions

### ✅ Do
1. **Use `/new` workflow** - It already works (plan → implement → finish → PR)
2. **Host-based agents** - Run Claude CLI on host, not in Docker (needs git/tools access)
3. **Mobile-first nav** - Bottom tabs don't work on iPhone, use mobile-optimized patterns
4. **Chicken logo** - New branding for all icons and assets
5. **Simple queue** - One feature at a time (FIFO), no parallel execution for MVP

### ❌ Don't
1. **No DAG execution** - Too complex, `/new` already handles task ordering
2. **No Docker agents** - Agents need host system access
3. **No bottom navigation** - Poor iPhone UX
4. **No complex orchestration** - Let `/new` skill handle it

---

## Phase 0: MVP (All Tasks)

### Task 1 — Chicken Logo Integration
- Generate all icon sizes from `frontend/public/chicken-logo.png`
  - Favicon: 16x16, 32x32 (ICO format)
  - Apple Touch Icon: 180x180 PNG
  - PWA Icons: 192x192, 512x512 PNG (standard + maskable)
- Update `frontend/public/manifest.json` with new icon paths
- Update `frontend/index.html` with favicon and apple-touch-icon links
- Add chicken logo to UI (welcome screen, header/nav branding)
- Files: `frontend/public/` (icons), `frontend/public/manifest.json`, `frontend/index.html`, `frontend/src/components/`

### Task 2 — Mobile-Friendly Navigation
- **Problem:** Bottom nav has poor iPhone UX (home indicator conflicts, thumb zones)
- **Solution:** Replace with mobile-optimized navigation
  - Option A: Hamburger menu + slide-out drawer
  - Option B: Top tabs with swipe gestures
  - Option C: Floating action button + minimal top bar
- Remove `BottomNav.tsx` component
- Create new nav component optimized for mobile (preferably hamburger + drawer for MVP)
- Test on iPhone Safari: tap targets, scrolling, gestures
- Files: `frontend/src/components/Layout/BottomNav.tsx` (delete), `frontend/src/components/Layout/MobileNav.tsx` (new), `frontend/src/components/Layout/AppShell.tsx`

### Task 3 — Database Schema
- Create `projects` table:
  - Columns: `id`, `name`, `description`, `repo_path`, `color`, `created_at`, `updated_at`
- Create `sessions` table:
  - Columns: `id`, `project_id` (FK), `feature_description`, `status` (`queued`, `running`, `completed`, `failed`), `created_at`, `started_at`, `completed_at`, `logs_path`, `pr_url`
- Migration scripts for PostgreSQL
- Files: `backend/db/migrations/`, `backend/models.py`

### Task 4 — Projects API
- CRUD endpoints for projects:
  - `GET /api/projects` — list all projects
  - `POST /api/projects` — create project (name, description, repo_path, color)
  - `GET /api/projects/{id}` — get project details
  - `PUT /api/projects/{id}` — update project
  - `DELETE /api/projects/{id}` — delete project
- Files: `backend/routers/projects.py` (new), `backend/main.py`

### Task 5 — Sessions API
- Endpoints for session management:
  - `POST /api/sessions` — create session (project_id, feature_description) → adds to queue
  - `GET /api/sessions` — list all sessions (with filters: project_id, status)
  - `GET /api/sessions/{id}` — get session details
  - `POST /api/sessions/{id}/stop` — stop running session
  - `POST /api/sessions/{id}/restart` — restart failed session
- Files: `backend/routers/sessions.py` (new), `backend/main.py`

### Task 6 — Host-Based Agent Execution
- **Critical:** Agents must run on host machine (not Docker) to access git, npm, pytest, etc.
- Implement PTY-based execution:
  - Spawn Claude CLI on host: `claude code --new "<feature_description>"`
  - Run in project's repo directory (from `projects.repo_path`)
  - Capture stdout/stderr, write to log file
  - Update session status: `queued` → `running` → `completed`/`failed`
- Handle PTY lifecycle: spawn, monitor, cleanup on crash
- Files: `backend/services/agent_executor.py` (new), `backend/services/pty_manager.py` (new)

### Task 7 — Simple Queue Worker
- Background worker that:
  - Polls `sessions` table for `status = 'queued'`
  - Executes one session at a time (FIFO)
  - Calls agent executor (Task 6)
  - Updates session status on completion/failure
- No parallel execution for MVP (add later if needed)
- Files: `backend/services/queue_worker.py` (new), `backend/main.py` (lifespan startup)

### Task 8 — WebSocket Log Streaming
- WebSocket endpoint: `ws://backend/api/sessions/{id}/logs`
- Stream agent stdout/stderr in real-time to connected clients
- Broadcast to all clients subscribed to a session
- Implement WebSocket hub/manager
- Files: `backend/ws/log_streamer.py` (new), `backend/ws/hub.py` (new), `backend/main.py`

### Task 9 — Frontend: Projects UI
- Project list view: shows all projects with colored tags
- Create project form: name, description, repo path, color picker
- Project detail view: shows associated sessions
- Files: `frontend/src/components/Projects/ProjectList.tsx`, `frontend/src/components/Projects/ProjectForm.tsx`, `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`

### Task 10 — Frontend: Feature Submission Form
- Simple form with:
  - Project selector (dropdown)
  - Feature description (textarea, multiline)
  - Submit button
- On submit: `POST /api/sessions`, redirect to session detail view
- Mobile-optimized: large tap targets, clear focus states
- Files: `frontend/src/components/Features/SubmitForm.tsx`, `frontend/src/lib/api.ts`

### Task 11 — Frontend: Session List View
- List all sessions (filterable by project, status)
- Each session card shows:
  - Feature description (truncated)
  - Project name + color tag
  - Status badge (`queued`, `running`, `completed`, `failed`)
  - Timestamp
  - Tap to view details
- Pull-to-refresh on mobile
- Files: `frontend/src/components/Sessions/SessionList.tsx`, `frontend/src/components/Sessions/SessionCard.tsx`

### Task 12 — Frontend: Session Detail View
- View single session:
  - Feature description (full)
  - Status + timestamps
  - Real-time log streaming (WebSocket)
  - Stop/restart buttons (if applicable)
  - PR link (if completed)
- Auto-scroll logs to bottom
- Mobile-friendly log viewer (monospace, scrollable)
- Files: `frontend/src/components/Sessions/SessionDetail.tsx`, `frontend/src/components/Sessions/LogViewer.tsx`

### Task 13 — Frontend: Welcome Screen
- Empty state when no sessions exist
- Chicken logo (large, centered)
- "Submit your first feature request" CTA button
- Links to: create project, submit feature
- Files: `frontend/src/components/Welcome/WelcomeScreen.tsx`

### Task 14 — Infrastructure: Host Execution Environment
- Ensure Claude CLI installed on host (NUC)
- Configure Claude API keys (environment variables or config file)
- Set up git on host (user, email, SSH keys for GitHub)
- Verify repo access (can clone/push)
- Document setup steps in `docs/SETUP.md`

### Task 15 — Infrastructure: Tailscale Networking
- Backend accessible via Tailscale from iPhone
- Test connectivity: `curl https://<tailscale-ip>/api/projects` from iPhone
- Document Tailscale setup in `docs/SETUP.md`

### Task 16 — PWA Configuration
- Service worker for offline support
- `manifest.json` with chicken logo icons
- Add-to-home-screen prompt
- Test on iPhone: install to home screen, launch, verify logo
- Files: `frontend/public/sw.js`, `frontend/public/manifest.json`, `frontend/index.html`

### Task 17 — End-to-End Testing
- Test full workflow from iPhone:
  1. Open Cockpit PWA
  2. Create project
  3. Submit feature request
  4. Monitor logs in real-time
  5. Verify PR created on GitHub
  6. Stop/restart session
- Document any issues, fix critical bugs

---

## Architecture Notes

### Backend Services
- **Agent Executor:** Spawns Claude CLI on host via PTY
- **Queue Worker:** Polls for queued sessions, runs them sequentially
- **WebSocket Hub:** Manages log streaming to connected clients
- **API Routers:** Projects, Sessions, (future: Notifications, Schedules)

### Frontend Structure
- **Mobile Nav:** Hamburger + drawer (replaces bottom nav)
- **Projects:** List, create, view
- **Sessions:** List, detail, logs
- **Welcome:** Empty state with chicken logo

### Database Tables
- `projects`: Project metadata
- `sessions`: Feature requests and execution state

### Key Integrations
- **PTY Management:** Spawn/monitor Claude CLI on host
- **WebSocket:** Real-time log streaming
- **Tailscale:** Secure mobile access

---

## Open Questions

1. **Navigation pattern:** Hamburger + drawer vs top tabs? (Recommend drawer for MVP)
2. **Queue concurrency:** Always one-at-a-time, or configurable N concurrent sessions? (One for MVP)
3. **Log persistence:** Store full logs in DB or just file paths? (File paths, stream from files)
4. **Error handling:** How to surface agent crashes to UI? (Show in logs, mark session as `failed`)

---

## Success Criteria

- [ ] Chicken logo visible in all sizes (favicon, PWA icons, UI)
- [ ] Mobile nav works perfectly on iPhone (no bottom nav issues)
- [ ] Can submit feature request from iPhone
- [ ] Can monitor logs in real-time on iPhone
- [ ] Agent runs on host (not Docker), completes `/new` workflow
- [ ] PR created successfully and linked in UI
- [ ] Can stop/restart sessions from mobile
- [ ] PWA installable to iPhone home screen

---

## Next Steps

1. Start with Task 1 (chicken logo) - quick win, sets branding
2. Then Task 2 (mobile nav) - critical UX fix
3. Then backend foundation (Tasks 3-8) - enable execution
4. Then frontend UI (Tasks 9-13) - complete the loop
5. Infrastructure & testing (Tasks 14-17) - deploy and validate
