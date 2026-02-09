# Test

Test the Claude Cockpit services after changes using docker-compose. Run this after `/feature` or `/fix`, before `/commit`.

## Steps

1. **Build images** — Rebuild any changed Docker images:
   ```
   docker-compose build api frontend
   ```

2. **Start services** — Bring up the full stack:
   ```
   docker-compose up -d
   ```
   Wait for health checks to pass (typically 10-15 seconds).

3. **Health check** — Poll `GET http://localhost:8000/api/health` every 2 seconds until HTTP 200, or fail after 30 seconds:
   ```
   curl -s http://localhost:8000/api/health | jq .
   ```

4. **Run API checks** — Execute each check below in order. Print the curl command before running it. Stop and report on the first failure.

5. **Frontend build check** — If frontend `.ts`/`.tsx` changes:
   ```
   docker-compose exec frontend npm run build
   ```

6. **View logs** — If any health checks fail:
   ```
   docker-compose logs --tail=20 api frontend postgres caddy
   ```

7. **Stop services** — After testing:
   ```
   docker-compose down
   ```

8. **Report** — Print a pass/fail summary.
9. **Prompt** — Tell the engineer: **Run `/commit` to ship.**

## API Checks

### 1. Health
```
curl -s http://localhost:8000/api/health | jq .
```
Expected: `{"status": "ok", "active_sessions": ...}`

### 2. List repos
```
curl -s http://localhost:8000/api/repos | jq .
```
Expected: Array of repo objects.

### 3. List sessions
```
curl -s http://localhost:8000/api/sessions | jq .
```
Expected: Array (may be empty).

### 4. List accounts
```
curl -s http://localhost:8000/api/accounts | jq .
```
Expected: Array with account usage info.

## Rules
- Always rebuild images if code changed.
- Print each curl command as you run it.
- If any check fails, print full response body and check `docker-compose logs`.
- Don't skip the frontend build check for TypeScript changes.
- Service names in docker-compose: `api`, `frontend`, `postgres`, `caddy`.
