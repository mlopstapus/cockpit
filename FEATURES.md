# Cockpit Feature Roadmap

Implementation plan for mobile-first remote feature submission using existing `/new` skill workflow.

## Status Legend

- 🔴 **Not Started** - Not yet implemented
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Complete** - Fully implemented and tested
- 🔵 **Blocked** - Waiting on dependencies

---

## Architecture Philosophy

**Core Principle:** Use the existing `/new` skill workflow. Don't build a DAG execution engine - just trigger `/new` remotely from a mobile interface.

**Why This Works:**
- `/new` already handles planning, implementation, testing, and PR creation
- Sequential execution (one feature at a time) is simpler and more reliable
- Mobile UI is the hard part - execution is already solved

---

## Phase 0: MVP (Mobile UI + Backend + /new Integration)

**Goal:** Enable feature submission from iPhone and monitor progress

### UI Features (Mobile-First)

| ID | Feature | Component | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| UI0.1 | Chicken Logo Integration | Frontend | - | 🟢 | Generate all icon sizes from chicken-logo.png: favicon (16x16, 32x32), PWA icons (192x192, 512x512), Apple touch icon (180x180) |
| UI0.2 | Update Manifest & HTML | Frontend | UI0.1 | 🟢 | Update manifest.json with chicken logo paths, add favicon/apple-touch-icon links to index.html |
| UI0.3 | Mobile-Friendly Navigation | Frontend | - | 🟢 | Mobile-optimized hamburger + drawer navigation (already existed) |
| UI0.4 | Feature Submission Form | Frontend | - | 🟢 | Feature description textarea in NewSessionModal, auto-triggers /new workflow |
| UI0.5 | Session List View | Frontend | - | 🟢 | SessionDashboard component shows active/recent sessions |
| UI0.6 | Session Detail View | Frontend | UI0.5 | 🟢 | ChatView component with streaming logs via WebSocket |
| UI0.7 | Project Organization | Frontend | - | 🟢 | ProjectsView with workspace browser, colored tags, CRUD operations |
| UI0.8 | Welcome Screen | Frontend | UI0.1 | 🟢 | WelcomeScreen with chicken logo + "New Session" CTA |
| UI0.9 | Mobile Responsiveness | Frontend | UI0.3 | 🟢 | Sidebar gestures, responsive layouts, mobile-first design throughout |

### Backend Features (Control Plane)

| ID | Feature | Component | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| BE0.1 | Projects API | Backend | - | 🟢 | CRUD endpoints: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/{id}` |
| BE0.2 | Sessions API | Backend | - | 🟢 | Create/list/get/stop sessions with feature_description support |
| BE0.3 | Feature Submission Handler | Backend | BE0.2 | 🟢 | Accepts feature_description, auto-sends `/new` command to Claude CLI |
| BE0.4 | Agent Execution (Host-Based) | Backend | BE0.3 | 🟢 | PTY-based ClaudeProcess spawns on host, runs in project directory |
| BE0.5 | Log Streaming (WebSocket) | Backend | BE0.4 | 🟢 | WebSocketHub broadcasts stdout/stderr to connected clients |
| BE0.6 | Session Control | Backend | BE0.4 | 🟢 | Stop session via DELETE /api/sessions/{id} (restart via new session) |
| BE0.7 | Workspace Discovery | Backend | - | 🟢 | `GET /api/workspaces/discover` scans ~/repos for git repositories |
| BE0.8 | Database Schema | Backend | - | 🟢 | SQLAlchemy models: Project, Session with SQLite/PostgreSQL support |

### Integration & Infrastructure

| ID | Feature | Component | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| INT0.1 | PTY Management | Backend | BE0.4 | 🟢 | ClaudeProcess manages PTY lifecycle, handles crashes, output streaming |
| INT0.2 | Host Execution Environment | Infrastructure | - | 🟡 | Requires deployment to NUC (pending Task #12 - end-to-end test) |
| INT0.3 | WebSocket Hub | Backend | BE0.5 | 🟢 | WebSocketHub manages connections, broadcasts to subscribers |
| INT0.4 | Tailscale Networking | Infrastructure | - | 🟡 | Requires deployment to NUC (pending Task #12 - end-to-end test) |
| INT0.5 | PWA Configuration | Frontend | UI0.2 | 🟢 | Service worker registered, manifest configured, offline support enabled |

---

## Phase 1: Enhancements (Post-MVP)

**Goal:** Improve UX and add convenience features

### Features

| ID | Feature | Component | Dependencies | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| ENH1.1 | FIFO Queue Worker | Backend | Phase 0 | 🔴 | Background worker polls for queued sessions, executes one at a time (FIFO) |
| ENH1.2 | Notifications/Inbox | Frontend + Backend | Phase 0 | 🔴 | Push notifications when sessions complete/fail, inbox view in UI |
| ENH1.3 | Session History | Frontend | Phase 0 | 🔴 | View past sessions, filter by project/status, search by feature description |
| ENH1.4 | PR Links in UI | Frontend | Phase 0 | 🔴 | Show PR URL when session completes, open in mobile browser |
| ENH1.5 | Scheduled Features (Cron) | Backend | Phase 0 | 🔴 | Schedule feature requests to run at specific times (e.g., "every Monday at 9am") |
| ENH1.6 | Multi-Session Support | Backend | Phase 0 | 🔴 | Allow N concurrent sessions (if needed), manage resource limits |
| ENH1.7 | Session Templates | Frontend | Phase 0 | 🔴 | Save common feature request templates, quick-submit with prefilled text |
| ENH1.8 | Settings UI | Frontend | Phase 0 | 🔴 | Configure Claude API keys, repo paths, agent settings from UI |

---

## Feature Summary

| Phase | Total Features | Frontend | Backend | Infrastructure | Complete |
|---|---|---|---|---|---|
| **Phase 0 (MVP)** | **22** | 9 | 8 | 5 | **20/22 (91%)** |
| **Phase 1 (Enhancements)** | **8** | 5 | 3 | 0 | **0/8 (0%)** |
| **Total** | **30** | **14** | **11** | **5** | **20/30 (67%)** |

**Phase 0 Status:**
- ✅ Complete: 20 features (branding, navigation, APIs, PTY execution, WebSocket, PWA, workspace discovery)
- 🟡 Pending deployment: 2 features (host environment, Tailscale - requires NUC setup for testing)

---

## Dependency Graph

```
Phase 0: MVP
  ├── Logo & Branding (UI0.1-UI0.2)
  ├── Mobile Navigation (UI0.3, UI0.9)
  ├── Feature Submission Flow
  │   ├── UI: Form + Session Views (UI0.4-UI0.8)
  │   ├── Backend: APIs + Queue (BE0.1-BE0.3, BE0.7-BE0.8)
  │   └── Agent: Host Execution (BE0.4, INT0.1-INT0.2)
  └── Real-Time Monitoring
      ├── Backend: WebSocket (BE0.5, INT0.3)
      └── UI: Log Streaming (UI0.6)

Phase 1: Enhancements (build after Phase 0 works)
  ├── Notifications (ENH1.1)
  ├── History & Search (ENH1.2-ENH1.3)
  ├── Scheduling (ENH1.4)
  └── Advanced Features (ENH1.5-ENH1.7)
```

---

## Implementation Priority

### Ship First (MVP - Phase 0)

**Goal:** Submit features from iPhone, monitor progress, get PRs

**Order:**
1. **Branding & Navigation** (UI0.1-UI0.3, UI0.9)
   - Chicken logo integration
   - Mobile-friendly nav (fix iPhone UX issues)

2. **Backend Foundation** (BE0.1, BE0.2, BE0.8, INT0.2, INT0.4)
   - Database schema
   - Projects & Sessions APIs
   - Host execution environment
   - Tailscale networking

3. **Feature Submission Flow** (UI0.4, BE0.3, BE0.4, BE0.7, INT0.1)
   - Submission form
   - Queue management
   - PTY-based `/new` execution on host

4. **Monitoring & Control** (UI0.5-UI0.8, BE0.5, BE0.6, INT0.3)
   - Session list/detail views
   - Log streaming via WebSocket
   - Stop/restart controls

5. **Polish** (INT0.5)
   - PWA configuration
   - Add-to-home-screen
   - Offline support

### Then (Enhancements - Phase 1)

**Build after Phase 0 is working and deployed:**
- Notifications and PR links
- Session history and search
- Scheduling (cron-triggered features)
- Multi-session support (if needed)

---

## Key Technical Decisions

### Why Host-Based Execution?

**Problem:** Agents running in Docker can't access git, tests, or tools properly.

**Solution:** Run Claude CLI directly on host machine via PTY. Full system access.

**Implementation:**
- Backend spawns PTY: `claude code --new "<feature>"`
- Captures stdout/stderr, streams to UI
- Session runs in project directory on host

### Why Simple Queue?

**Problem:** DAG execution is complex and over-engineered.

**Solution:** One feature at a time, FIFO queue. The `/new` skill already handles dependencies and ordering.

**Implementation:**
- `sessions` table has `status` column: `queued`, `running`, `completed`, `failed`
- Worker polls for `queued` sessions, runs them sequentially
- If parallel execution is needed later, add it incrementally

### Why No Bottom Nav on Mobile?

**Problem:** Bottom navigation has poor UX on iPhone (home indicator conflicts, thumb zones).

**Solution:** Use mobile-optimized patterns:
- Hamburger menu + drawer
- Top tabs with swipe gestures
- Floating action button for primary action

**Implementation:** UI0.3 redesigns navigation with mobile-first principles.

---

## Next Steps

1. **Update PR #3** with this simplified architecture
2. **Start Phase 0 Implementation**
   - Begin with branding (chicken logo) and mobile nav
   - Then backend foundation
   - Then feature submission flow
3. **Deploy to NUC** when MVP is functional
4. **Test end-to-end** from iPhone

**Update this document as features are implemented and status changes.**
