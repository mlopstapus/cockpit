# Plan: UI Overhaul — Modern Sidebar Navigation + Task Scheduling

**Status:** Planning
**Created:** 2026-02-09

## Goal

Replace the bottom-tab navigation with a responsive sidebar drawer (persistent on desktop, overlay on mobile) inspired by Claude and ChatGPT apps. Add project-based chat organization, task scheduling with cron, and a persistent notification inbox. Integrate the Cockpit logo throughout (favicon, PWA icons, sidebar, welcome screen).

---

## Phase 1: Sidebar + Projects + Chat UI + Logo

Core navigation and organizational overhaul. Ship this first.

### Task 1 — Process and integrate the Cockpit logo
- Generate favicon (16x16, 32x32 ICO), Apple touch icon (180x180), PWA icons (192x192, 512x512, 512x512 maskable) from the source PNG
- Update `frontend/public/manifest.json` with real icon paths
- Update `frontend/index.html` with favicon and apple-touch-icon links
- Add logo to sidebar header and welcome screen
- Files: `frontend/public/` (icons), `frontend/public/manifest.json`, `frontend/index.html`

### Task 2 — Build responsive sidebar component
- Create `Sidebar.tsx` — slide-out drawer on mobile (<768px), persistent panel on desktop (>=768px)
- Hamburger menu button in header on mobile, always-visible on desktop
- Swipe-from-left-edge to open on mobile (touch gesture)
- Overlay backdrop on mobile when open
- Sections: Logo/branding at top, navigation items, Settings + Profile pinned at bottom
- Files: `frontend/src/components/Layout/Sidebar.tsx`, `frontend/src/components/Layout/SidebarHeader.tsx`

### Task 3 — Remove bottom tab bar, update AppShell layout
- Remove `BottomNav.tsx` (replaced by sidebar)
- Update `AppShell.tsx` to use sidebar + main content area layout
- Add top header bar with hamburger toggle (mobile) and page title
- Update Zustand store: replace `TabName` with richer navigation state (current view, selected project, selected session)
- Files: `frontend/src/components/Layout/AppShell.tsx`, `frontend/src/components/Layout/BottomNav.tsx` (delete), `frontend/src/components/Layout/Header.tsx` (new), `frontend/src/lib/store.ts`

### Task 4 — Add Projects backend (DB model + API endpoints)
- Create `projects` DB table: id, name, description, repo_path, color, icon, created_at, updated_at
- Link sessions to projects: add `project_id` foreign key to sessions
- API endpoints:
  - `GET /api/projects` — list all projects
  - `POST /api/projects` — create project (name, description, repo_path, color)
  - `GET /api/projects/{id}` — project details with sessions
  - `PUT /api/projects/{id}` — update project
  - `DELETE /api/projects/{id}` — delete project
  - `GET /api/projects/{id}/sessions` — list sessions for project
- Update `POST /api/sessions` to accept optional `project_id`
- Files: `backend/models.py`, `backend/routers/projects.py` (new), `backend/routers/sessions.py`, `backend/db/` (migration)

### Task 5 — Add Projects to sidebar + frontend types
- Add `ProjectInfo` type to `frontend/src/types/index.ts`
- Add project API calls to `frontend/src/lib/api.ts`
- Sidebar shows: list of projects (with colored icons), "New project" button, standalone chats section below
- Tapping a project opens its session list in the main content area
- Files: `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/components/Layout/Sidebar.tsx`, `frontend/src/components/Projects/ProjectList.tsx` (new), `frontend/src/components/Projects/NewProjectModal.tsx` (new)

### Task 6 — Redesign main chat view with welcome screen
- Empty state: centered Cockpit logo + "How can I help you?" text + input bar (like Claude app screenshot)
- Agent/account selector dropdown in header (like Claude's "Opus 4.6" picker)
- Clean up chat view layout for sidebar-based navigation (no back button needed on desktop, keep on mobile)
- Files: `frontend/src/components/Chat/WelcomeScreen.tsx` (new), `frontend/src/components/Chat/ChatView.tsx`, `frontend/src/components/Chat/AgentSelector.tsx` (new)

### Task 7 — Add Settings and Profile to sidebar bottom
- Settings icon + label pinned to bottom of sidebar (above safe area)
- Profile section: show current account name/avatar, quick account switcher
- Settings page: relocate existing SettingsView content + add agent list with utilization meters (move from AccountPanel)
- Files: `frontend/src/components/Settings/SettingsView.tsx`, `frontend/src/components/Layout/Sidebar.tsx`, `frontend/src/components/Settings/ProfileSection.tsx` (new), `frontend/src/components/Settings/AgentList.tsx` (new)

### Task 8 — Fix existing bugs and cleanup
- Fix service worker TypeScript syntax (rewrite `sw.js` as valid JS)
- Remove compiled `.js` files alongside `.tsx` source files (add to `.gitignore`)
- Fix dual message send in `InputBar.tsx` (pick one: REST or WS)
- Add Vite `resolve.alias` for `@/` path alias
- Remove unused deps or wire them up (`@tanstack/react-query`, `clsx`, `tailwind-merge`)
- Install `tailwindcss-animate` for animation classes actually used
- Files: `frontend/public/sw.js`, `frontend/src/components/Chat/InputBar.tsx`, `frontend/vite.config.ts`, `frontend/package.json`, `frontend/.gitignore`

---

## Phase 2: Tasks Tab + Cron Scheduler + Inbox

Backend services and UI for scheduling and notifications. Build after Phase 1 ships.

### Task 9 — Build Tasks sidebar tab (frontend)
- New "Tasks" section in sidebar navigation
- Tasks view shows: running sessions (with live status), recently completed tasks, scheduled tasks
- Each task card: name, project, status, duration/last run, quick actions (stop, restart, view)
- Files: `frontend/src/components/Tasks/TasksView.tsx` (new), `frontend/src/components/Tasks/TaskCard.tsx` (new)

### Task 10 — Build cron scheduler backend
- New `schedules` DB table: id, project_id, name, cron_expression, prompt, repo_path, enabled, last_run, next_run, created_at
- Use APScheduler for cron execution (triggers `session_manager.create_session()` + sends prompt)
- New backend service: `backend/services/scheduler.py`
- API endpoints:
  - `GET /api/schedules` — list all schedules
  - `POST /api/schedules` — create schedule (project_id, name, cron_expression, prompt)
  - `PUT /api/schedules/{id}` — update schedule (edit cron, prompt, enable/disable)
  - `DELETE /api/schedules/{id}` — delete schedule
  - `POST /api/schedules/{id}/run-now` — trigger immediately
- Files: `backend/services/scheduler.py` (new), `backend/routers/schedules.py` (new), `backend/models.py`, `backend/main.py` (lifespan init)

### Task 11 — Build schedule editor UI
- Per-project schedule management (accessed from project view or Tasks tab)
- Schedule creation form: name, cron expression (with human-readable preview like "Every weekday at 9am"), prompt text, enable/disable toggle
- Schedule list with next run time, last run status, quick toggle
- Files: `frontend/src/components/Tasks/ScheduleEditor.tsx` (new), `frontend/src/components/Tasks/CronInput.tsx` (new), `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`

### Task 12 — Build notifications backend
- New `notifications` DB table: id, type (task_complete, needs_input, schedule_run, error), title, message, session_id, project_id, read, created_at
- Notifications created by: task completion, session errors, scheduled task runs, sessions needing user input
- Push to connected frontends via WebSocket hub (new `notification` message type)
- API endpoints:
  - `GET /api/notifications` — list notifications (with unread count)
  - `POST /api/notifications/{id}/read` — mark as read
  - `POST /api/notifications/read-all` — mark all as read
- Files: `backend/models.py`, `backend/routers/notifications.py` (new), `backend/ws/hub.py`, `backend/main.py`

### Task 13 — Build Inbox UI in sidebar
- Dedicated "Inbox" tab in sidebar with unread badge count
- Notification list: icon by type, title, message preview, timestamp, read/unread styling
- Tap notification to navigate to relevant session/project
- Mark as read on tap, "Mark all read" button
- Files: `frontend/src/components/Inbox/InboxView.tsx` (new), `frontend/src/components/Inbox/NotificationCard.tsx` (new), `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`

---

## Architecture Notes

- [x] New API endpoints: `/api/projects/*`, `/api/schedules/*`, `/api/notifications/*`
- [x] New backend services: `scheduler.py` (APScheduler cron engine)
- [x] WebSocket changes: add `notification` message type to hub
- [x] New frontend components: Sidebar, Header, ProjectList, NewProjectModal, WelcomeScreen, AgentSelector, ProfileSection, AgentList, TasksView, TaskCard, ScheduleEditor, CronInput, InboxView, NotificationCard
- [x] DB changes: `projects` table, `schedules` table, `notifications` table; `sessions` gets `project_id` FK
- [x] Config changes: scheduler settings in `backend/config.py`
- [x] Logo/branding: favicon, PWA icons, Apple touch icon, sidebar header, welcome screen

## Open Questions

- What color palette for project icons in sidebar? (Can default to a preset list and let users pick)
- Should the cron scheduler support one-shot scheduled tasks (run once at a specific time) in addition to recurring?
- Maximum number of concurrent scheduled sessions? (To avoid overwhelming the NUC)
