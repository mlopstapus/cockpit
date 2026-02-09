# Claude Cockpit 🚀

## Your Personal AI Dev Team, Managed From Your Phone

A self-hosted React PWA + FastAPI backend that lets you manage multiple Claude Code agent sessions from your iPhone, running on your Intel NUC over Tailscale.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  iPhone (Safari PWA)                                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Claude Cockpit                                     │ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │ │
│  │  │Opero │ │Laddr │ │Smartr│ │ New+ │  ← Sessions   │ │
│  │  └──┬───┘ └──────┘ └──────┘ └──────┘              │ │
│  │     │                                               │ │
│  │  ┌──▼──────────────────────────────────────────┐   │ │
│  │  │ Chat Interface                               │   │ │
│  │  │ > Fix the Docker build for the API service   │   │ │
│  │  │ ┌──────────────────────────────────────────┐ │   │ │
│  │  │ │ 🤖 Found the issue in Dockerfile...      │ │   │ │
│  │  │ │ Running docker build... ✓                 │ │   │ │
│  │  │ │ Tests passing. Pushed to feature branch.  │ │   │ │
│  │  │ └──────────────────────────────────────────┘ │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS + WebSocket over Tailscale
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Intel NUC (Ubuntu)                                      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Docker Compose Stack                               │ │
│  │  ├── PostgreSQL (persistent data)                   │ │
│  │  ├── FastAPI Backend (cockpit-api)                  │ │
│  │  ├── React Frontend (cockpit-app)                   │ │
│  │  └── Nginx (reverse proxy + caching)               │ │
│  │                                                       │ │
│  │  Session Manager                                    │ │
│  │  ├── Session 1: claude (~/repos/opero)             │ │
│  │  ├── Session 2: claude (~/repos/laddr)             │ │
│  │  └── Session 3: claude (~/repos/smartr)            │ │
│  │                                                       │ │
│  │  Account Rotator                                    │ │
│  │  ├── Account A: pro-sub (usage: 72%)               │ │
│  │  └── Account B: max-sub (usage: 31%)               │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend Foundation (Days 1-2)

### ✅ Complete - Docker Orchestration Ready

**What's built:**
- FastAPI server with session management
- PTY-based Claude Code CLI wrapper
- WebSocket hub for real-time streaming
- Account rotation with rate limit detection
- PostgreSQL persistence layer
- Nginx reverse proxy with caching
- Docker Compose orchestration (dev + prod)

```bash
docker-compose up -d
curl http://localhost:8000/api/health
```

---

## Phase 2: Modern Mobile-First Frontend (Days 3-5) - NEXT

### Goal: Mobile-first React PWA that feels native on iPhone

The frontend is the centerpiece. Users will spend 90% of their time here. Build it **fast, responsive, and delightful**.

### 2.1 Tech Stack

- **Framework:** React 18+ with TypeScript, Vite for fast builds
- **Styling:** Tailwind CSS with mobile-first approach
- **State:** TanStack Query (React Query) for server state + local state with Zustand
- **UI:** Shadcn/ui components (modern, accessible, customizable)
- **Real-time:** WebSocket hook with automatic reconnection
- **PWA:** Workbox service worker, offline capability, push notifications
- **Mobile:** iOS/Android responsive design, touch-optimized interactions
- **Performance:** Code splitting, lazy loading, image optimization

### 2.2 Design Principles

**Mobile-First (iPhone Primary):**
- Design assumes **iPhone screen first** — 375px width baseline
- Vertical scroll-focused interface (no horizontal scrolling)
- Touch targets: minimum 44x44px (Apple recommendation)
- Safe area insets (notch + home indicator awareness)
- Bottom navigation/FAB for one-handed operation
- Swipe gestures for navigation

**Visual Language:**
- **Dark theme:** `#0a0a0a` base (true dark for OLED)
- **Accent color:** `#3b82f6` (electric blue — tech, friendly)
- **Typography:** Inter or JetBrains Mono (modern, monospace for code)
- **Motion:** Subtle animations, < 300ms transitions (snappy, not sluggish)
- **Icons:** Lucide or Feather icons (consistent, minimal)

**Real-Time UX:**
- WebSocket streaming of Claude output — visible in real-time
- Typing indicator when Claude is thinking
- Diffs highlighted with syntax coloring
- File uploads drag-drop support
- Auto-scroll chat to latest message
- Unread badge counts

### 2.3 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppShell.tsx       # Main wrapper with bottom nav
│   │   │   ├── BottomNav.tsx      # iOS-style tab bar (5 items max)
│   │   │   ├── SafeArea.tsx       # Notch + home indicator padding
│   │   │   └── StatusBar.tsx      # Account usage, connection status
│   │   ├── Sessions/
│   │   │   ├── SessionList.tsx    # Infinite scroll, pull-to-refresh
│   │   │   ├── SessionCard.tsx    # Preview + quick actions
│   │   │   ├── SessionDetailView.tsx  # Full session open
│   │   │   └── NewSessionModal.tsx    # Repo picker + creation
│   │   ├── Chat/
│   │   │   ├── ChatView.tsx       # Main chat interface
│   │   │   ├── MessageBubble.tsx  # User + Assistant bubbles
│   │   │   ├── StreamingOutput.tsx  # Live Claude output with ANSI
│   │   │   ├── InputBar.tsx       # Message input + send
│   │   │   ├── CodeBlock.tsx      # Syntax-highlighted code
│   │   │   ├── FilePreview.tsx    # Inline file diffs
│   │   │   └── TypingIndicator.tsx
│   │   ├── Accounts/
│   │   │   ├── AccountPanel.tsx   # Usage dashboard
│   │   │   └── UsageMeter.tsx     # Visual gauge per account
│   │   ├── Common/
│   │   │   ├── Badge.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── Toast.tsx          # Notifications
│   │   │   └── Skeleton.tsx       # Loading states
│   ├── hooks/
│   │   ├── useWebSocket.ts        # Session streaming
│   │   ├── useSessions.ts         # Session CRUD + infinite scroll
│   │   ├── useAccounts.ts         # Account polling
│   │   ├── useLocalStorage.ts     # Persistent UI state
│   │   └── useOnline.ts           # Network status
│   ├── lib/
│   │   ├── api.ts                 # Full REST + WebSocket client
│   │   ├── queryClient.ts         # TanStack Query setup
│   │   ├── store.ts               # Zustand global state
│   │   └── ansi.ts                # ANSI color parser
│   ├── types/
│   │   └── index.ts               # Mirror backend Pydantic models
│   ├── pwa/
│   │   ├── manifest.json          # PWA metadata
│   │   ├── serviceWorker.ts       # Offline + background sync
│   │   └── assets/
│   │       ├── icon-192.png       # Homescreen icon
│   │       └── icon-512.png       # Splash screen
│   ├── App.tsx                    # Root component + routing
│   └── main.tsx
├── Dockerfile                     # Multi-stage build
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 2.4 Screen-by-Screen Design

**Screen 1: Session Dashboard (Swipe between tabs)**
- Grid/list of active sessions with status
- Each card: repo name, last message preview, status (🟢 running / 🟡 building / 🔴 error), account
- Pull-to-refresh to reload sessions
- FAB: "+" to create new session
- Empty state: "Create your first session" with animated illustration

**Screen 2: Chat View (Single session)**
- Full-screen chat interface
- Header: session name, repo, branch, uptime, account badge
- Message list with streaming output
- Live syntax highlighting for code blocks
- Inline diffs (collapsible, side-by-side on large screens)
- Test results, Docker logs inline
- Input bar: text input + send button
- Quick actions: "Run tests", "Docker up", "Git status" (swipeable buttons)
- Soft keyboard auto-scroll

**Screen 3: Account Manager (Settings tab)**
- Card per account: name, tier, usage %
- Visual gauge (filled circle, 0-100%)
- Rate limit status ("Resets in 2h 34m")
- Manual reset button
- Auto-rotation toggle
- Last message count, estimated capacity

**Screen 4: Repo Picker (Modal for new session)**
- List of configured repos
- Repo icon (monospace logo)
- Description + default branch
- Docker Compose indicator
- Select to create session

**Screen 5: Settings/About**
- Connected Tailscale device info
- Version info
- Clear cache
- Enable notifications

### 2.5 Key UX Patterns

**Real-Time Streaming:**
```typescript
// Pseudo-code for streaming output
<StreamingOutput
  messages={messages}
  outputBuffer={outputBuffer}
  isStreaming={isConnected}
/>

// Raw terminal output with ANSI codes rendered as styled spans
```

**Infinite Scroll Sessions:**
- Load 10 sessions at a time
- Pagination token in API response
- Swipe down to load more in list

**Send Message + Streaming:**
```
User types → Click send
  ↓
Input bar shows spinner ✨
  ↓
WebSocket listens for /ws/sessions/{id}
  ↓
Chunks arrive (50-500ms intervals)
  ↓
Message bubbles appear and grow with content
  ↓
"Claude is thinking..." → actual output
  ↓
Done → Stop spinner
```

**Offline Support:**
- Service worker caches API responses
- "You're offline" banner if no connection
- Queues messages (stored in localStorage)
- Syncs when online

### 2.6 Performance & PWA

**Build:**
- Vite for lightning-fast dev server (< 100ms HMR)
- Tree-shaking, code splitting (routes lazy-loaded)
- Image optimization (next-gen formats, responsive srcset)

**Bundle Size Target:** < 150KB gzipped
- React: 40KB
- Tailwind: 30KB
- Shadcn/ui: 20KB
- Misc: 60KB

**PWA Checklist:**
- ✅ manifest.json (name, icons, start_url, display: standalone)
- ✅ Service worker (offline fallback, cache strategies)
- ✅ HTTPS (via Tailscale)
- ✅ Responsive design (tested on iPhone, iPad, Android)
- ✅ Install prompt (iOS: "Add to Home Screen")
- ✅ Notifications (push API for task completion)

### 2.7 Implementation Order

1. **Foundation (Day 3)**
   - Vite + TypeScript + Tailwind setup
   - App shell layout with bottom nav
   - API client + WebSocket hook (from existing code)
   - Global state (Zustand for UI state)

2. **Core Views (Day 4)**
   - Session dashboard with infinite scroll
   - Chat view with message streaming
   - Input bar + send logic
   - Account panel

3. **Polish (Day 5)**
   - ANSI color parsing + code highlighting
   - Animations + transitions
   - Offline support (service worker)
   - PWA manifest + install prompt
   - Mobile testing (iPhone + Android)
   - Dark mode refinement

---

## Phase 3: Account Rotation & Rate Limit Management (Day 6)

### Goal: Seamless switching between Claude subscription accounts

**Account Rotator:**
- Tracks usage per account
- Detects rate limits from Claude CLI output
- Auto-switches when limited
- Notifies user: "Switched to Account B (Account A rate limited)"

**Config in `backend/config.py`:**
```python
accounts = [
    {"id": "primary", "name": "Claude Pro", "tier": "pro", "priority": 1},
    {"id": "secondary", "name": "Claude Max", "tier": "max", "priority": 2},
]
```

### 3.1 In-App Account Re-Authentication (NEW)

**Problem:** When a Claude subscription token expires, users must SSH into the NUC to re-authenticate. This is painful on mobile.

**Solution:** Build in-app auth management directly in the Cockpit app.

**Flow:**

1. **Detection:** Backend detects auth failure when Claude CLI returns "authentication required" or similar
2. **Notification:** User sees badge on Account card: 🔴 "Auth Needed"
3. **Modal Prompt:** User taps account → Auth modal appears with:
   - Account name + tier
   - Message: "Please re-authenticate to continue"
   - "Start Authentication" button
4. **Live Auth Process:** User taps button → PTY `claude login` streams in modal
   - Interactive terminal UI (shows prompts in real-time)
   - User follows on-screen instructions (selects subscription, confirms device)
   - Output streams live (no delay)
5. **Success:** Modal shows "✅ Authenticated" → Closes automatically
6. **Retry:** Failed session auto-resumes with new freshly-authed account

**Backend Endpoints:**
```
GET    /api/accounts/{id}/auth-status         → Check if account is authenticated
POST   /api/accounts/{id}/authenticate        → Start `claude login` in PTY
WS     /ws/accounts/{id}/auth-stream          → Stream interactive auth process
POST   /api/accounts/{id}/auth-confirm        → Confirm auth completed
```

**Frontend Components:**
```
AccountAuthModal.tsx
  ├── Header: Account name + tier
  ├── AuthTerminal.tsx     # Live streaming terminal output
  │   ├── Handles cursor + interactive input
  │   ├── Streams from WebSocket
  │   └── Shows Claude CLI prompts in real-time
  └── Actions: Cancel, Retry

AccountCard.tsx           # Main session card
  ├── Auth badge (🔴 if needs auth)
  └── Tap to trigger AuthModal

StatusBar.tsx            # Show auth status per account
  ├── Green dot: ready
  ├── Red dot: needs auth
  └── Spinner: authenticating
```

**User Experience on iPhone:**
```
You're in the chat, Claude hits a rate limit and auto-switches.
Account B is selected but... 🔴 needs auth.

Notification pops up:
  "Account B needs re-authentication"

You tap it → Modal slides up showing:

  ┌─────────────────────────┐
  │ Claude Pro              │
  │                         │
  │ Please sign in:         │
  │ > Use web login device? │
  │                         │
  │ [type response...]      │
  │                         │
  │         [Cancel] [Done] │
  └─────────────────────────┘

You follow the on-screen prompts (exactly as you would in terminal).
When done, modal auto-closes and your session resumes.

No SSH-ing. No manual login. All from your phone.
```

**Implementation Notes:**
- Backend spawns `CLAUDE_CONFIG_DIR=/path/to/account claude login` in PTY
- Sends all output to WebSocket client in real-time
- Frontend renders as interactive terminal (accepts user input, sends back)
- On completion, account's auth_status changes to `authenticated`
- Failed sessions automatically retry with fresh auth

---

## Phase 4: Docker & Nginx Setup (Days 7-8)

### ✅ Complete - Production Ready

- Docker Compose with PostgreSQL, FastAPI, React, Nginx
- Health checks + auto-restart
- Nginx caching for static assets
- Tailscale HTTPS ready

---

## Phase 5: Tailscale + PWA (Day 9)

### Goal: One-tap installation on iPhone homescreen

**Setup:**
1. Tailscale your NUC
2. Generate cert: `tailscale cert nuc.tailnet.ts.net`
3. Update Nginx SSL config
4. Restart: `docker-compose up -d nginx`

**On iPhone:**
1. Open Safari → `https://nuc.tailnet.ts.net`
2. Tap Share → "Add to Home Screen"
3. Icon appears on homescreen
4. Full-screen experience (no browser chrome)

---

## Phase 6: Polish & Power Features (Day 10)

### Push Notifications
- Service worker listens for task completion
- "✅ Opero: Tests passing. Ready to merge."

### Quick Commands (Session Card)
- 🚀 Deploy (if docker-compose exists)
- 🧪 Run tests
- 📊 Git status
- 🐳 Docker logs

### Session Templates
- Save common session configs
- "Opero Backend Dev" → auto-start docker, set branch
- "Laddr Frontend" → npm start

### ANSI & Syntax Highlighting
- Terminal output colored
- Code blocks with language-specific highlighting
- Collapsible file diffs

---

## Development Timeline

| Day | Focus | Deliverable |
|-----|-------|-------------|
| 1-2 | Backend + Nginx ✅ | Claude processes + WebSocket streaming + Docker |
| 3 | React scaffold + API client | Session list + account status |
| 4 | Chat view + streaming | Full chat experience on iPhone |
| 5 | Polish + PWA | Mobile performance, offline support, install prompt |
| 6 | Account rotation | Auto-switching between subscription accounts |
| 7-8 | Docker + production | Nginx caching, health checks, Tailscale HTTPS |
| 9 | PWA install | Homescreen icon, full-screen experience |
| 10 | Features + testing | Push notifications, templates, final polish |

---

## The Vision

```
You're at a coffee shop. Pull out your iPhone.
Tap the Cockpit icon on your home screen.

Three agents are running:
  🟢 Opero: "Finished migrating patient schema. All tests pass."
  🟡 Laddr: "Building Docker image... 62%"
  🔴 Smartr: "Rate limited on Account A, switching to B..."

You tap into Opero:
  "Now add the appointment reminder SMS flow.
   Use the Twilio integration we set up last week.
   Run the tests when done."

The chat streams in real-time in a native-looking interface.
Syntax highlighting, test output, git diffs — all inline.

You put your phone down and drink your coffee.
Two minutes later, a notification:
  "✅ Opero: SMS flow implemented. 14 tests passing.
     Pushed to feature/sms-reminders."

That's Claude Cockpit.
```

---

## Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.12, FastAPI, WebSockets, PostgreSQL |
| Frontend | React 18+, TypeScript, Tailwind, Shadcn/ui, Vite |
| State | TanStack Query + Zustand |
| Real-time | WebSocket + Service Worker |
| Process Mgmt | PTY-based Claude Code CLI |
| Reverse Proxy | Nginx with caching |
| Orchestration | Docker Compose |
| Networking | Tailscale |
| Auth | Tailscale ACLs |
| Persistence | PostgreSQL + localStorage |
| PWA | Workbox, manifest, service worker |

---

## Running It

```bash
# Development
docker-compose up -d
curl http://localhost:8000/api/health
npm run dev  # Frontend separate for HMR

# Production
docker-compose up -d
# Nginx handles routing on port 80 (+ 443 with Tailscale HTTPS)
```

---

## Next Steps for You

1. **Frontend:** Start with Vite + Tailwind scaffold
2. **API Client:** Wire up existing REST + WebSocket
3. **Session List:** Infinite scroll, pull-to-refresh
4. **Chat View:** Messages + streaming integration
5. **Mobile Testing:** iPhone + Android responsiveness

**Remember:** Mobile-first. Touch-first. Fast. Delightful.

Good luck! 🚀
