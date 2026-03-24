import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expandHome } from '../config/index.js';
import { listActive } from '../db/jobs.js';

const COCKPIT_DIR = expandHome('~/.cockpit');
const PID_FILE = path.join(COCKPIT_DIR, 'daemon.pid');

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function getStartCommand(platform) {
  if (platform === 'darwin') {
    return `launchctl start com.cockpit.daemon`;
  }
  return `systemctl --user start cockpit-daemon`;
}

export function getStopCommand(platform) {
  if (platform === 'darwin') {
    return `launchctl stop com.cockpit.daemon`;
  }
  return `systemctl --user stop cockpit-daemon`;
}

export function getRestartCommand(platform) {
  if (platform === 'darwin') {
    return [
      `launchctl stop com.cockpit.daemon`,
      `sleep 1`,
      `launchctl start com.cockpit.daemon`,
    ];
  }
  return [`systemctl --user restart cockpit-daemon`];
}

export function getDaemonStatus({ pidFile = PID_FILE } = {}) {
  if (!fs.existsSync(pidFile)) {
    return { running: false, reason: 'no_pid_file', pid: null };
  }

  let pid;
  try {
    pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  } catch {
    return { running: false, reason: 'unreadable_pid_file', pid: null };
  }

  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false, reason: 'process_not_found', pid };
  }
}

// ─── CLI actions ─────────────────────────────────────────────────────────────

export function startDaemon() {
  const cmd = getStartCommand(process.platform);
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('Daemon started.');
  } catch (err) {
    console.error(`Failed to start daemon: ${err.message}`);
    process.exit(1);
  }
}

export function stopDaemon() {
  const cmd = getStopCommand(process.platform);
  try {
    execSync(cmd, { stdio: 'inherit' });
    // Remove PID file if it exists
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log('Daemon stopped.');
  } catch (err) {
    console.error(`Failed to stop daemon: ${err.message}`);
    process.exit(1);
  }
}

export function restartDaemon() {
  const cmds = getRestartCommand(process.platform);
  try {
    for (const cmd of cmds) {
      execSync(cmd, { stdio: 'inherit' });
    }
    console.log('Daemon restarted.');
  } catch (err) {
    console.error(`Failed to restart daemon: ${err.message}`);
    process.exit(1);
  }
}

export function showStatus(db, config) {
  const status = getDaemonStatus();

  if (status.running) {
    console.log(`Daemon: running (PID ${status.pid})`);
  } else {
    // Fallback to systemctl/launchctl on Linux
    if (process.platform === 'linux') {
      try {
        const isActive = execSync('systemctl --user is-active cockpit-daemon 2>/dev/null', { stdio: 'pipe' })
          .toString().trim();
        console.log(`Daemon: ${isActive} (via systemctl)`);
      } catch {
        console.log('Daemon: stopped');
      }
    } else {
      console.log('Daemon: stopped');
    }
  }

  if (db) {
    const active = listActive(db);
    if (active.length > 0) {
      const j = active[0];
      const elapsed = Math.round((Date.now() - new Date(j.updated_at).getTime()) / 1000);
      console.log(`Active job: ${j.id} (${j.spec_name}) — stage: ${j.stage} — elapsed: ${elapsed}s`);
    } else {
      console.log('Queue: idle');
    }
  }

  if (config) {
    console.log(`\nWatched repos (${config.repos.length}):`);
    for (const r of config.repos) {
      console.log(`  ${r.repo} → ${r.localPath}`);
    }
  }
}
