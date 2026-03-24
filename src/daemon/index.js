import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index.js';
import { readConfig, validateConfig, expandHome } from '../config/index.js';
import { startPollLoop } from './poller.js';
import { requeueInterrupted } from '../db/jobs.js';

const COCKPIT_DIR = expandHome('~/.cockpit');
const PID_FILE = path.join(COCKPIT_DIR, 'daemon.pid');
const DB_PATH = path.join(COCKPIT_DIR, 'cockpit.db');

export function recoverCrashedJobs(db) {
  // Re-queue interrupted jobs so they resume from the last started stage.
  // Note: requeueInterrupted only touches status='active' — rate_limited jobs are
  // intentionally left in their wait state and will be requeued by
  // requeueExpiredRateLimited in the poll loop once the reset time passes.
  requeueInterrupted(db);
}

export async function start() {
  // Validate config
  let config;
  try {
    config = readConfig(COCKPIT_DIR);
    validateConfig(config);
  } catch (err) {
    console.error(`Config error: ${err.message}`);
    console.error(`Run 'cockpit init' to configure Cockpit.`);
    process.exit(1);
  }

  // Open DB
  fs.mkdirSync(COCKPIT_DIR, { recursive: true });
  const db = openDb(DB_PATH);

  // Crash recovery: mark any lingering active jobs as failed
  recoverCrashedJobs(db);

  // Write PID file
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');

  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { fs.unlinkSync(PID_FILE); } catch {}
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`Cockpit daemon started (PID ${process.pid})`);

  await startPollLoop(db, { getShuttingDown: () => shuttingDown });
}

// Run when invoked directly (by launchd, systemd, or CLI)
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
