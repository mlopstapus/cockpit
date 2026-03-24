# Quickstart: Cockpit Node.js Rewrite

**Branch**: `002-nodejs-rewrite` | **Date**: 2026-03-24

Integration scenarios for testing and validation.

---

## Scenario 1: Fresh install and first poll

**Goal**: Verify setup-to-first-poll works end to end.

```bash
# 1. Install cockpit globally
npm install -g .  # from repo root

# 2. Run init wizard
cockpit init

# Wizard should:
# - Detect git and claude on PATH
# - Prompt for token, owner, repos
# - Write ~/.cockpit/config.json (check: ls -la ~/.cockpit/config.json → -rw-------)
# - Write service file to ~/.config/systemd/user/cockpit-daemon.service (Linux)
#   or ~/Library/LaunchAgents/com.cockpit.daemon.plist (macOS)

# 3. Verify config written correctly
cat ~/.cockpit/config.json

# 4. Start daemon
cockpit start

# 5. Verify running
cockpit status
# Expected: "Daemon: running (PID XXXXX)"
```

---

## Scenario 2: Issue detection and acknowledgement

**Goal**: Verify the daemon picks up a `[COCKPIT]` issue within one poll cycle.

```bash
# With daemon running and a watched repo configured:

# 1. Open a test issue on GitHub (title: "[COCKPIT] test detection")
gh issue create --title "[COCKPIT] test detection" --body "integration test" \
  --repo owner/repo

# 2. Wait one poll interval (default 30s)

# 3. Check issue for acknowledgement comment
gh issue view <issue-number> --repo owner/repo --comments

# Expected: Comment from cockpit bot saying job was picked up

# 4. Check daemon logs
cockpit logs
# Expected: Lines showing issue detected, job enqueued, pipeline starting
```

---

## Scenario 3: Live config reload — add repo without restart

**Goal**: Verify FR-014 (repos add takes effect on next cycle without restart).

```bash
# 1. With daemon running, note current watched repos
cockpit repos list

# 2. Add a new repo
cockpit repos add owner/new-repo /path/to/new-repo

# 3. Verify config updated
cat ~/.cockpit/config.json | grep new-repo

# 4. Wait one poll cycle (30s)

# 5. Check logs — should see new-repo being polled
cockpit logs
# Expected: polling owner/new-repo appears in log output

# No restart should have occurred
cockpit status
# Expected: daemon still running (uptime unchanged since before add)
```

---

## Scenario 4: Token rotation

**Goal**: Verify `cockpit token` updates credential and daemon picks it up.

```bash
# 1. Run token update
cockpit token
# Wizard prompts for new token

# 2. Verify file permissions preserved
ls -la ~/.cockpit/config.json
# Expected: -rw------- (600)

# 3. Wait one poll cycle
# Expected: no authentication errors in cockpit logs
cockpit logs
```

---

## Scenario 5: Stop, modify config, restart

**Goal**: Verify restart picks up config changes.

```bash
# 1. Stop daemon
cockpit stop
cockpit status
# Expected: "Daemon: stopped"

# 2. Manually edit config (e.g., change pollIntervalSeconds)
# (or use cockpit repos add/remove)

# 3. Restart
cockpit restart

# 4. Verify new interval in logs
cockpit logs
```

---

## Scenario 6: Failed job recovery

**Goal**: Verify queue continues after a job fails.

```bash
# 1. Create an issue for a repo with no local clone path
cockpit repos add owner/repo /nonexistent/path

# 2. Open [COCKPIT] issue in that repo

# 3. Wait for daemon to pick it up

# 4. Check issue comments — should show error comment
gh issue view <number> --comments

# 5. Create a second issue in a working repo — verify it runs
# (Queue should not be permanently blocked by the failed job)
```

---

## Scenario 7: Post-implement hook

**Goal**: Verify POST_IMPLEMENT_COMMAND fires and posts a comment.

```bash
# 1. Set post-implement command in config
# Edit ~/.cockpit/config.json: "postImplementCommand": "echo 'hook ran' >> /tmp/cockpit-hook.log"

# 2. Let a pipeline complete

# 3. Verify sentinel file
cat /tmp/cockpit-hook.log
# Expected: "hook ran"

# 4. Check issue comments for ✅ hook comment
```
