# Cockpit Autonomous Development System

A self-hosted mobile interface for triggering Claude Code `/new` workflows remotely.

## What It Does

**Input:** Feature idea from mobile interface (iPhone)
**Output:** Production-ready pull request via `/new` skill workflow

**Simple Process:**
1. Submit feature request from mobile UI
2. Backend triggers `/new` skill on host machine
3. `/new` → `/plan` → `/implement` → `/finish` workflow executes
4. PR is created automatically
5. Human reviews and merges

**Core Insight:** Don't reinvent the wheel. The `/new` skill workflow already works - just trigger it remotely.

## Architecture

### Three Simple Components

**1. Mobile UI (React PWA)**
- iPhone-optimized interface for feature submission
- Session monitoring (view logs, stop/restart)
- Project organization
- Works over Tailscale from anywhere

**2. Backend Control Plane (FastAPI)**
- Receives feature requests from UI
- Triggers `/new` skill on host machine (not in Docker)
- Manages session lifecycle via PTY
- Streams logs back to UI via WebSocket
- Persists state in PostgreSQL

**3. Claude Code Agent (Host Machine)**
- Runs `/new` skill workflow for each feature
- Executes on host (access to git, tests, tools)
- Not sandboxed in Docker - full system access
- Uses existing proven workflow: `/new` → `/plan` → `/implement` → `/finish`

## Why This Works

**Proven Workflow:** `/new` skill already handles:
- Planning (creates PLAN.md)
- Implementation (writes code, runs tests)
- Quality gates (linting, testing)
- PR creation (git push, gh pr create)

**No DAG Complexity:** Sequential execution is fine. One feature at a time is simpler and more reliable.

**Mobile-First Control:** The hard part isn't execution - it's being able to submit features remotely and monitor progress from your phone.

## Key Design Decisions

### ✅ Do
- **Simple queue:** Accept features from UI, run them one at a time
- **Host-based execution:** Agents run on host machine with full access
- **Mobile-optimized nav:** Bottom nav doesn't work on iPhone - use mobile-friendly patterns
- **Stream logs:** Real-time feedback via WebSocket
- **Chicken logo:** Use new chicken branding for all icons/assets

### ❌ Don't
- **No DAG execution:** Too complex. `/new` workflow is proven and simple.
- **No Docker agents:** Agents need host access for git, tools, tests
- **No parallel execution:** One feature at a time is fine for MVP
- **No complex orchestration:** Let `/new` skill handle the workflow

## Safety & Governance

**Guardrails inherited from `/new` skill:**
- Execution in feature branches
- Tests must pass before commit
- Human approval required at PR merge
- No auto-merge, no force push

**Additional UI safeguards:**
- View session logs before approving PR
- Stop/restart sessions from mobile
- Manual trigger per feature (no automatic execution)

## Infrastructure

```
User (iPhone PWA)
  ↓ Tailscale
Backend (FastAPI on NUC)
  ↓ PTY spawn
Claude Code Agent (host machine)
  ↓ /new skill
Git repository → Pull Request
```

**Key Infrastructure Notes:**
- **Networking:** Tailscale secure access
- **Authentication:** Network-level ACL (no app-level auth)
- **Agent Execution:** PTY-managed Claude CLI on host (not Docker)
- **State:** PostgreSQL for session tracking

## Tech Stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS
- Mobile-first navigation (not bottom tabs - poor iPhone UX)
- Chicken logo branding
- PWA for home screen installation

**Backend:** FastAPI, Python, PostgreSQL
- PTY management for Claude CLI
- WebSocket log streaming
- Session queue (FIFO, one at a time)

**Agent:** Claude Code CLI on host
- Uses existing `/new` skill workflow
- Full host system access (git, npm, pytest, etc.)

## Implementation Roadmap

See [FEATURES.md](FEATURES.md) for detailed feature breakdown.

**Phase 0 (MVP):** UI + Backend + `/new` integration
- Mobile interface for feature submission
- Session management and monitoring
- PTY-based agent execution on host
- One feature at a time, simple queue

**Phase 1+ (Future):** Enhancements
- Multiple concurrent sessions (if needed)
- Scheduled features (cron-triggered `/new`)
- Notifications/inbox
- Advanced monitoring

## Strategic Value

Cockpit makes autonomous development **accessible from anywhere**.

- Submit features while walking the dog
- Monitor progress from your phone
- Review PRs on mobile
- Merge when ready

**The innovation isn't in execution (Claude Code already handles that). The innovation is in remote accessibility and mobile UX.**

## Current Status

**Phase 0 MVP: ✅ Complete (20/22 features - 91%)**

**Implemented:**
- ✅ Chicken logo branding (all icon formats: favicon, PWA, maskable)
- ✅ Mobile-friendly navigation (hamburger + drawer pattern)
- ✅ Dynamic workspace discovery (scans `~/repos` for git repositories)
- ✅ Database schema (SQLAlchemy: Project, Session models)
- ✅ Projects API (CRUD with workspace browser UI)
- ✅ Sessions API (create/list/get with feature_description)
- ✅ Host-based PTY agent execution (ClaudeProcess)
- ✅ Auto-trigger `/new` workflow from feature requests
- ✅ WebSocket log streaming (real-time output to mobile)
- ✅ Feature submission UI (NewSessionModal with textarea)
- ✅ PWA configuration (service worker, manifest, offline support)

**Database:** SQLite for MVP (switch to PostgreSQL via `DATABASE_URL` env var)

**Deferred to Phase 1:**
- ⏭️ FIFO queue worker (direct execution sufficient for MVP)

**Pending Deployment & Testing:**
- 🟡 Deploy backend to NUC
- 🟡 Configure Tailscale access from iPhone
- 🟡 End-to-end test: submit feature from iPhone → PR created on GitHub

---

**Next:** Deploy to NUC and test full workflow from iPhone over Tailscale.
