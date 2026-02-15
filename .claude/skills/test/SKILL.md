# Test

Run automated checks to verify changes work. Executes tests for both FastAPI backend and React PWA frontend.

## Steps

1. **Backend tests** — Run FastAPI test suite:
   ```bash
   cd backend && pytest
   ```
   Or if using different test framework:
   ```bash
   cd backend && python -m pytest tests/
   ```

2. **Frontend tests** — Run React test suite:
   ```bash
   cd frontend && npm test
   ```
   Or type checking:
   ```bash
   cd frontend && npx tsc --noEmit
   ```

3. **Integration checks** — Run basic API health checks:
   - Backend health endpoint
   - Frontend build succeeds
   - API client connectivity

4. **Verify with user** - Verify that things are working on the user end. If not, apply fix.

5. **Report** — Print pass/fail summary.

6. **Prompt** — Tell user: **Run `/finish` to ship.**

## Quick Health Check Script

Run this script to verify basic API connectivity:

```bash
#!/bin/bash
set -e

# Adjust BASE_URL based on your deployment (local dev, Tailscale, etc.)
BASE_URL="http://localhost:8000"  # FastAPI default port
PASS_COUNT=0
FAIL_COUNT=0

echo "Running Cockpit health checks..."
echo ""

# Check 1: Backend health
echo "1️⃣  GET /health"
if curl -sf "$BASE_URL/health" > /dev/null; then
  echo "   ✅ PASS"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL"
  ((FAIL_COUNT++))
fi

# Check 2: API docs (FastAPI auto-generated)
echo "2️⃣  GET /docs"
if curl -sf "$BASE_URL/docs" > /dev/null; then
  echo "   ✅ PASS"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL"
  ((FAIL_COUNT++))
fi

# Check 3: Sessions endpoint
echo "3️⃣  GET /api/sessions"
if curl -sf "$BASE_URL/api/sessions" > /dev/null; then
  echo "   ✅ PASS"
  ((PASS_COUNT++))
else
  echo "   ❌ FAIL"
  ((FAIL_COUNT++))
fi

# Check 4: Frontend (if serving via separate port)
echo "4️⃣  GET / (frontend)"
if curl -sf http://localhost:3000 > /dev/null; then
  echo "   ✅ PASS"
  ((PASS_COUNT++))
else
  echo "   ⚠️  SKIP (frontend may not be running)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
```

Adapt endpoints based on your actual API routes.
