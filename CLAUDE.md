# Claude Cockpit

A self-hosted React PWA + FastAPI backend for managing multiple Claude Code agent sessions from your iPhone, running on an Intel NUC over Tailscale.

## Architecture

```
iPhone (Safari PWA) → HTTPS/WS over Tailscale → NUC (FastAPI + Claude Code CLI)
```

- **Backend:** Python 3.12, FastAPI, WebSockets, PostgreSQL — runs in Docker on Intel NUC
- **Frontend:** React 18+, TypeScript, Tailwind CSS, Vite — served as PWA
- **Process Management:** PTY-based Claude Code CLI sessions via `backend/services/claude_process.py`
- **Networking:** Tailscale for zero-config secure access, Nginx reverse proxy
- **Auth:** Tailscale ACLs (network-level) — no app-level auth needed
- **Orchestration:** Docker Compose with PostgreSQL, FastAPI, React, and Nginx

## Project Structure

```
cockpit/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, lifespan, WS endpoint
│   ├── config.py               # Settings, repo paths, account configs
│   ├── models.py               # Pydantic models for API + WebSocket messages
│   ├── requirements.txt
│   ├── routers/
│   │   ├── sessions.py         # Session CRUD + message sending
│   │   └── repos.py            # Repo listing + account management
│   ├── services/
│   │   ├── session_manager.py  # Orchestrates multiple Claude sessions
│   │   ├── claude_process.py   # PTY-based Claude CLI wrapper
│   │   └── account_rotator.py  # Multi-account rate limit management
│   ├── ws/
│   │   └── hub.py              # WebSocket connection manager + streaming
│   └── db/
│       └── (database.py)       # PostgreSQL models (TODO)
├── frontend/
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts # WebSocket hook for session streaming
│   │   ├── lib/
│   │   │   └── api.ts          # REST + WebSocket client
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript interfaces
│   │   └── components/         # React UI components
│   └── public/
│       └── manifest.json       # PWA manifest
├── infra/
│   ├── nginx.conf              # Nginx reverse proxy config
│   ├── setup.sh                # NUC setup script
│   └── claude-cockpit.service  # systemd unit file
├── docker-compose.yml          # Production config
├── docker-compose.override.yml # Dev config with hot reload
├── Dockerfile (backend/frontend) # Multi-stage builds
└── PLAN.md                     # Full development roadmap
```

## Key Patterns

### Backend
- Routes use `request.app.state` to access shared services (session_manager, ws_hub, account_rotator)
- Services are initialized in `main.py` lifespan context manager
- Claude processes use `os.fork()` + PTY for interactive terminal sessions
- Account rotation auto-detects rate limits from CLI output and switches profiles
- WebSocket hub broadcasts Claude output to all connected frontends per session

### Frontend
- Mobile-first PWA — designed for iPhone Safari "Add to Home Screen"
- Dark theme: `#0a0a0a` base
- WebSocket streaming for real-time Claude output
- API client at `frontend/src/lib/api.ts` — all REST calls go through this

### API Endpoints
```
GET    /api/health              → System health + session/account status
GET    /api/repos               → List configured repos
GET    /api/sessions            → List all sessions
POST   /api/sessions            → Create new session {repo_name, name?, account_id?}
GET    /api/sessions/{id}       → Session details
POST   /api/sessions/{id}/send  → Send message to session (interactive)
POST   /api/sessions/{id}/oneshot → Send one-shot command
DELETE /api/sessions/{id}       → Stop session
WS     /ws/sessions/{id}        → Stream session output
GET    /api/accounts            → List accounts + usage stats
POST   /api/accounts/{id}/reset-limit → Reset rate limit
```

## Running Locally

### Quick Start (Docker Compose)
```bash
cd /path/to/cockpit
docker-compose up -d
curl http://localhost:8000/api/health
```

**Access points:**
- Direct API: http://localhost:8000
- Direct frontend (Vite): http://localhost:3000 (dev) or http://localhost:5173 (Vite)
- Via Nginx: http://localhost:80 (proxies both API and frontend)

### Manual Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://cockpit:password@localhost:5432/cockpit"
python main.py
```

### Manual Frontend (dev)
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

## Rules
- Never hardcode API keys or Claude profile tokens in source
- Account rotation logic stays in `account_rotator.py`
- PTY/process logic stays in `claude_process.py`
- All WebSocket message types defined in `models.py` (`WSMessageType`)
- Frontend types mirror backend Pydantic models in `types/index.ts`
- Config values (repos, accounts, limits) go in `backend/config.py`
