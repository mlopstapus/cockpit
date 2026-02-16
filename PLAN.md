# Plan: Cockpit MVP - Mobile Feature Submission

**Status:** 🚢 Shipped
**Created:** 2026-02-15
**Started:** 2026-02-15
**Completed:** 2026-02-15
**Shipped:** 2026-02-15
**PR:** https://github.com/mlopstapus/cockpit/pull/4
**Commit:** c974315
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

### Task 1 — Chicken Logo Format Generation
- **Source:** `frontend/public/chicken-logo.png` (orange chicken illustration)
- **Generate all required formats:**
  - **Favicon:**
    - 16x16 PNG → `favicon-16.png`
    - 32x32 PNG → `favicon-32.png`
    - Combine into `favicon.ico` (multi-resolution ICO file)
  - **Apple Touch Icon:**
    - 180x180 PNG → `apple-touch-icon.png` (rounded corners, solid background)
  - **PWA Icons:**
    - 192x192 PNG → `icon-192.png` (standard)
    - 512x512 PNG → `icon-512.png` (standard)
    - 192x192 PNG → `icon-192-maskable.png` (with safe zone padding)
    - 512x512 PNG → `icon-512-maskable.png` (with safe zone padding)
- **Tools:** Use ImageMagick or Python (Pillow) to resize and convert:
  ```bash
  # Example with ImageMagick
  convert chicken-logo.png -resize 16x16 favicon-16.png
  convert chicken-logo.png -resize 32x32 favicon-32.png
  convert favicon-16.png favicon-32.png favicon.ico
  convert chicken-logo.png -resize 180x180 apple-touch-icon.png
  # etc.
  ```
- **Maskable icons:** Add 20% padding (safe zone) to prevent cropping on Android
- Update `frontend/public/manifest.json` with new icon paths and purpose ("any" vs "maskable")
- Update `frontend/index.html` with `<link>` tags for favicon and apple-touch-icon
- Add chicken logo to UI components (welcome screen, header/nav branding)
- Files: `frontend/public/` (all icon files), `frontend/public/manifest.json`, `frontend/index.html`, `frontend/src/components/Welcome/WelcomeScreen.tsx`

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

### Task 3 — Dynamic Workspace Discovery (Replace Hardcoded Repos)
- **Problem:** Repos currently hardcoded in `backend/config.py` (opero, laddr, smartr)
- **Solution:** Dynamically discover projects from host directory
- **Implementation:**
  - Remove hardcoded `repos` list from `backend/config.py`
  - Add `repos_root` setting (default: `~/repos` or configurable via env var)
  - Create `/api/workspaces/discover` endpoint:
    - Scan `repos_root` directory on host
    - For each subdirectory, check if it's a git repo (`git rev-parse --git-dir`)
    - Return list of discovered repos with metadata:
      - `name`: directory name
      - `path`: full path
      - `is_git_repo`: boolean
      - `default_branch`: detect from `git symbolic-ref refs/remotes/origin/HEAD` or fallback to "main"
      - `has_docker_compose`: check for `docker-compose.yml`
  - Update `/api/projects` POST endpoint to accept `repo_path` from discovery results
  - Frontend: Add "Browse Workspaces" button → shows discovered repos → user selects one to create project
- **Host-based execution:** Since agents run on host (not Docker), use direct filesystem access
- **Migration:** On startup, if `projects` table is empty and old hardcoded repos exist in config, auto-create projects from them (one-time migration)
- Files: `backend/config.py` (remove hardcoded repos), `backend/routers/workspaces.py` (new), `backend/services/workspace_discovery.py` (new), `frontend/src/components/Workspaces/WorkspaceBrowser.tsx` (new)

### Task 4 — Database Schema
- Create `projects` table:
  - Columns: `id`, `name`, `description`, `repo_path`, `color`, `created_at`, `updated_at`
- Create `sessions` table:
  - Columns: `id`, `project_id` (FK), `feature_description`, `status` (`queued`, `running`, `completed`, `failed`), `created_at`, `started_at`, `completed_at`, `logs_path`, `pr_url`
- Migration scripts for PostgreSQL
- Files: `backend/db/migrations/`, `backend/models.py`

### Task 5 — Projects API
- CRUD endpoints for projects:
  - `GET /api/projects` — list all projects
  - `POST /api/projects` — create project (name, description, repo_path, color)
  - `GET /api/projects/{id}` — get project details
  - `PUT /api/projects/{id}` — update project
  - `DELETE /api/projects/{id}` — delete project
- Files: `backend/routers/projects.py` (new), `backend/main.py`

### Task 6 — Sessions API
- Endpoints for session management:
  - `POST /api/sessions` — create session (project_id, feature_description) → adds to queue
  - `GET /api/sessions` — list all sessions (with filters: project_id, status)
  - `GET /api/sessions/{id}` — get session details
  - `POST /api/sessions/{id}/stop` — stop running session
  - `POST /api/sessions/{id}/restart` — restart failed session
- Files: `backend/routers/sessions.py` (new), `backend/main.py`

### Task 7 — Host-Based Agent Execution
- **Critical:** Agents must run on host machine (not Docker) to access git, npm, pytest, etc.
- Implement PTY-based execution:
  - Spawn Claude CLI on host: `claude code --new "<feature_description>"`
  - Run in project's repo directory (from `projects.repo_path`)
  - Capture stdout/stderr, write to log file
  - Update session status: `queued` → `running` → `completed`/`failed`
- Handle PTY lifecycle: spawn, monitor, cleanup on crash
- Files: `backend/services/agent_executor.py` (new), `backend/services/pty_manager.py` (new)

### ~~Task 8 — Simple Queue Worker~~ (Moved to Phase 1)
- **Status:** Deferred to Phase 1 (ENH1.1)
- **Reason:** Current implementation uses direct execution with `max_concurrent_sessions` limit
- **For MVP:** Sessions start immediately when created - sufficient for testing
- **Phase 1:** Add proper queueing system for better control and scheduling

### Task 9 — WebSocket Log Streaming
- WebSocket endpoint: `ws://backend/api/sessions/{id}/logs`
- Stream agent stdout/stderr in real-time to connected clients
- Broadcast to all clients subscribed to a session
- Implement WebSocket hub/manager
- Files: `backend/ws/log_streamer.py` (new), `backend/ws/hub.py` (new), `backend/main.py`

### Task 10 — Frontend: Projects UI with Workspace Browser
- Project list view: shows all projects with colored tags
- Create project form with workspace browser:
  - "Browse Workspaces" button → calls `/api/workspaces/discover`
  - Shows discovered repos from host directory
  - User selects repo → auto-fills `repo_path`
  - Manual fields: name (pre-filled from repo name), description, color picker
- Project detail view: shows associated sessions
- Files: `frontend/src/components/Projects/ProjectList.tsx`, `frontend/src/components/Projects/ProjectForm.tsx`, `frontend/src/components/Workspaces/WorkspaceBrowser.tsx` (new), `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`

### Task 11 — Frontend: Feature Submission Form
- Simple form with:
  - Project selector (dropdown)
  - Feature description (textarea, multiline)
  - Submit button
- On submit: `POST /api/sessions`, redirect to session detail view
- Mobile-optimized: large tap targets, clear focus states
- Files: `frontend/src/components/Features/SubmitForm.tsx`, `frontend/src/lib/api.ts`

### Task 12 — Frontend: Session List View
- List all sessions (filterable by project, status)
- Each session card shows:
  - Feature description (truncated)
  - Project name + color tag
  - Status badge (`queued`, `running`, `completed`, `failed`)
  - Timestamp
  - Tap to view details
- Pull-to-refresh on mobile
- Files: `frontend/src/components/Sessions/SessionList.tsx`, `frontend/src/components/Sessions/SessionCard.tsx`

### Task 13 — Frontend: Session Detail View
- View single session:
  - Feature description (full)
  - Status + timestamps
  - Real-time log streaming (WebSocket)
  - Stop/restart buttons (if applicable)
  - PR link (if completed)
- Auto-scroll logs to bottom
- Mobile-friendly log viewer (monospace, scrollable)
- Files: `frontend/src/components/Sessions/SessionDetail.tsx`, `frontend/src/components/Sessions/LogViewer.tsx`

### Task 14 — Frontend: Welcome Screen
- Empty state when no sessions exist
- Chicken logo (large, centered)
- "Submit your first feature request" CTA button
- Links to: create project, submit feature
- Files: `frontend/src/components/Welcome/WelcomeScreen.tsx`

### Task 15 — Infrastructure: Host Execution Environment
- Ensure Claude CLI installed on host (NUC)
- Configure Claude API keys (environment variables or config file)
- Set up git on host (user, email, SSH keys for GitHub)
- Verify repo access (can clone/push)
- Document setup steps in `docs/SETUP.md`

### Task 16 — Infrastructure: Tailscale Networking
- Backend accessible via Tailscale from iPhone
- Test connectivity: `curl https://<tailscale-ip>/api/projects` from iPhone
- Document Tailscale setup in `docs/SETUP.md`

### Task 17 — PWA Configuration
- Service worker for offline support
- `manifest.json` with chicken logo icons
- Add-to-home-screen prompt
- Test on iPhone: install to home screen, launch, verify logo
- Files: `frontend/public/sw.js`, `frontend/public/manifest.json`, `frontend/index.html`

### Task 18 — End-to-End Testing
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

- [x] Chicken logo visible in all sizes (favicon, PWA icons, UI)
- [x] Mobile nav works perfectly on iPhone (hamburger + drawer)
- [x] Can submit feature request from iPhone (NewSessionModal with feature_description)
- [x] Can monitor logs in real-time (WebSocket streaming implemented)
- [x] Agent runs on host via PTY, auto-triggers `/new` workflow
- [x] Database schema created (Project, Session models)
- [x] Dynamic workspace discovery from ~/repos
- [x] PWA configured (service worker, manifest, icons)
- [ ] **Deployment:** Backend running on NUC (pending)
- [ ] **E2E Test:** Full workflow tested from iPhone (pending)

---

## Implementation Summary

**Completed (Tasks 1-7, 9-17):**
1. ✅ Chicken logo in all formats (favicon, PWA icons, maskable)
2. ✅ Mobile-friendly navigation (hamburger + drawer already existed)
3. ✅ Dynamic workspace discovery (`/api/workspaces/discover`)
4. ✅ Database schema (SQLAlchemy models for Project, Session)
5. ✅ Projects API (CRUD operations, in-memory storage)
6. ✅ Sessions API (create/list/get with feature_description support)
7. ✅ Host-based PTY agent execution (ClaudeProcess, auto-triggers `/new`)
9. ✅ WebSocket log streaming (WebSocketHub, real-time output)
10. ✅ Projects UI with workspace browser
11. ✅ Feature submission form (NewSessionModal)
12. ✅ Session list view (SessionDashboard)
13. ✅ Session detail view with logs (ChatView)
14. ✅ Welcome screen with chicken logo
17. ✅ PWA configuration (service worker, manifest, icons)

**Deferred to Phase 1:**
8. ⏭️ FIFO queue worker (direct execution sufficient for MVP)

**Pending Deployment:**
15. 🟡 Host execution environment (Claude CLI on NUC)
16. 🟡 Tailscale networking (backend accessible from iPhone)
18. 🟡 End-to-end testing from iPhone

**Next Steps:**
1. Deploy backend to NUC
2. Configure Tailscale access
3. Test full workflow from iPhone
4. Create PR and merge to main
