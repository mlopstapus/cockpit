# Quickstart: Generalize Cockpit for Any Project

## Validation Checklist

Use this to verify the feature is working end-to-end after implementation.

---

## Prerequisites

- Node.js 18+ installed (`node --version`)
- Python 3.11+ with virtualenv installed
- `git` on PATH
- `claude` CLI on PATH (run `claude --version` to confirm)
- A GitHub repository you want to watch
- A local clone of that repository

---

## Test 1: Fresh Setup (Linux)

```bash
# 1. Clone cockpit
git clone <cockpit-repo-url> ~/cockpit-test
cd ~/cockpit-test

# 2. Run setup
node setup/index.js

# 3. Follow prompts:
#    - Enter a test GitHub token (read:repo scope is enough for testing)
#    - Enter your GitHub username
#    - Enter a test repo (e.g. your-user/test-repo)
#    - Enter the local path to that repo
#    - Skip POST_IMPLEMENT_COMMAND for now
#    - Accept default DB_PATH

# 4. Verify outputs
cat .env | grep GITHUB_OWNER           # Should show your username, not mlopstapus
cat .env | grep mlopstapus             # Should return nothing
cat .env | grep seamless               # Should return nothing
ls cockpit-api@*.service               # Should exist with your username

# 5. Verify no Docker dependency
grep -r docker .                       # Should return nothing meaningful
grep -r redis .                        # Should return nothing in backend/

# 6. Start the backend (no docker required)
cd backend && .venv/bin/pip install -r requirements.txt
cd backend && .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &

# 7. Confirm startup
curl http://localhost:8000/health      # Should return {"status": "ok"}
```

**Expected**: Cockpit starts, SQLite DB created at configured path, no Redis/Docker errors.

---

## Test 2: POST_IMPLEMENT_COMMAND Hook

```bash
# Configure a test hook
echo 'POST_IMPLEMENT_COMMAND=echo "hook ran" >> /tmp/cockpit-hook-test.txt' >> .env

# Restart Cockpit
# ... (restart service)

# Create a [COCKPIT] issue in your test repo
# Wait for pipeline to run through implement stage
# Then:
cat /tmp/cockpit-hook-test.txt         # Should contain "hook ran"

# Verify GitHub issue comment shows hook result
# Open the issue in GitHub and look for "✅ Post-implement hook ran successfully."
```

---

## Test 3: Hardcoded Reference Audit

```bash
cd ~/cockpit-test

# None of these should return results
grep -r "mlopstapus" backend/ setup/ .env.example CLAUDE.md
grep -r "seamless-expo" backend/ setup/ .env.example CLAUDE.md
grep -r "seamless" backend/config.py backend/services/

# These SHOULD appear (as generic placeholders)
grep "your-github-username" .env.example
grep "your-repo" .env.example
```

---

## Test 4: macOS Setup (on macOS)

```bash
node setup/index.js

# Complete prompts
# Verify:
ls ~/Library/LaunchAgents/com.cockpit.api.plist  # Should exist
cat ~/Library/LaunchAgents/com.cockpit.api.plist | grep your-username  # Should NOT appear
# Should contain your actual username
```

---

## Test 5: Spec-kit Install + Constitution Builder

```bash
# During setup, when prompted about spec-kit:
# - Answer Y to install spec-kit
# - Answer Y to run constitution builder
# - Follow the claude interactive session

# After:
ls <target-repo>/.specify/              # Should contain spec-kit files
ls <target-repo>/.specify/memory/constitution.md  # Should exist
```

---

## Test 6: Non-Interactive Mode

```bash
node setup/index.js --yes --target /path/to/target-repo

# Should complete without any prompts (using defaults)
# Should NOT run spec-kit install or constitution builder in --yes mode
# (those require interactive input)
```

---

## Failure Scenarios to Verify

| Scenario | Expected Behavior |
|----------|-------------------|
| Run `node setup/index.js` twice | Second run prompts "overwrite? [y/N]" before touching .env |
| `POST_IMPLEMENT_COMMAND` exits non-zero | Warning comment posted; pipeline still marked complete |
| `POST_IMPLEMENT_COMMAND` not set | No hook comment; no error in logs |
| `claude` not on PATH during setup phase 4 | Prints install instructions; exits gracefully (code 2) |
| `git` not on PATH during spec-kit install | Prints error; skips spec-kit install; continues to next phase |
