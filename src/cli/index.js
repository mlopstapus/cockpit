#!/usr/bin/env node
import { program } from 'commander';
import { runInit } from './init.js';
import { startDaemon, stopDaemon, restartDaemon, showStatus } from './daemon-control.js';
import { showLogs } from './logs.js';
import { repoList, repoAdd, repoRemove } from './repos.js';
import { rotateToken } from './token.js';
import { retryFailedJob } from './retry.js';
import { listRecent } from '../db/jobs.js';
import chalk from 'chalk';
import { expandHome, readConfig } from '../config/index.js';
import { openDb } from '../db/index.js';
import path from 'node:path';
import { start as daemonStart } from '../daemon/index.js';

const COCKPIT_DIR = expandHome('~/.cockpit');

function openDbSafe() {
  try {
    return openDb(path.join(COCKPIT_DIR, 'cockpit.db'));
  } catch {
    return null;
  }
}

function readConfigSafe() {
  try {
    return readConfig(COCKPIT_DIR);
  } catch {
    return null;
  }
}

program
  .name('cockpit')
  .description('GitHub-native AI pipeline — open an issue, watch Claude build the feature')
  .version('0.1.0');

// cockpit init
program
  .command('init')
  .description('Interactive setup wizard')
  .option('--yes', 'Non-interactive mode: read all values from environment variables')
  .option('--target <dir>', 'Config directory (default: ~/.cockpit)')
  .action(async (opts) => {
    await runInit({ yes: opts.yes || false, configDir: opts.target });
  });

// cockpit daemon (internal — invoked by service manager)
program
  .command('daemon')
  .description('Start the daemon process (internal — use cockpit start instead)')
  .action(async () => {
    await daemonStart();
  });

// cockpit start
program
  .command('start')
  .description('Start the background daemon')
  .action(() => startDaemon());

// cockpit stop
program
  .command('stop')
  .description('Stop the background daemon')
  .action(() => stopDaemon());

// cockpit restart
program
  .command('restart')
  .description('Restart the background daemon')
  .action(() => restartDaemon());

// cockpit status
program
  .command('status')
  .description('Show daemon health, active job, queue depth, and watched repos')
  .action(() => {
    const db = openDbSafe();
    const config = readConfigSafe();
    showStatus(db, config);
    if (db) db.close();
  });

// cockpit logs [job-id]
program
  .command('logs [job-id]')
  .description('Show daemon logs or logs for a specific job')
  .option('-n <lines>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action((jobId, opts) => {
    const db = openDbSafe();
    showLogs(db, jobId, { n: parseInt(opts.n, 10), follow: opts.follow });
    // Note: don't close db if following (interval keeps running)
    if (db && !opts.follow) db.close();
  });

// cockpit repos
const repos = program.command('repos').description('Manage watched repos');

repos
  .command('list')
  .description('List all watched repos')
  .action(() => repoList(COCKPIT_DIR));

repos
  .command('add <repo> <local-path>')
  .description('Add a repo to the watch list (owner/name format)')
  .option('--startup-command <cmd>', 'shell command to run after implement stage')
  .action((repo, localPath, opts) => repoAdd(COCKPIT_DIR, repo, localPath, { startupCommand: opts.startupCommand }));

repos
  .command('remove <repo>')
  .description('Remove a repo from the watch list')
  .action((repo) => {
    try {
      repoRemove(COCKPIT_DIR, repo);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

// cockpit jobs
program
  .command('jobs')
  .description('List recent jobs')
  .option('-n <count>', 'Number of jobs to show', '20')
  .action((opts) => {
    const db = openDbSafe();
    if (!db) { console.error('No database found. Run cockpit init first.'); process.exit(1); }
    const jobs = listRecent(db, parseInt(opts.n, 10));
    db.close();
    if (jobs.length === 0) { console.log('No jobs found.'); return; }
    for (const j of jobs) {
      const statusColor = { active: chalk.yellow, completed: chalk.green, failed: chalk.red, queued: chalk.blue }[j.status] || chalk.white;
      const ts = new Date(j.created_at).toLocaleString();
      console.log(`${chalk.bold(j.id)}  ${statusColor(j.status.padEnd(9))}  ${ts}  ${j.spec_name}`);
      if (j.error) console.log(`  ${chalk.red('error:')} ${j.error}`);
    }
  });

// cockpit retry
program
  .command('retry [job-id]')
  .description('Requeue a failed job for re-execution')
  .option('--last', 'Retry the most recently failed job')
  .action((jobId, opts) => {
    const db = openDbSafe();
    if (!db) { console.error('Error: no database found. Run cockpit init first.'); process.exit(1); }
    retryFailedJob(db, jobId, opts);
    db.close();
  });

// cockpit token
program
  .command('token')
  .description('Rotate the GitHub personal access token')
  .action(async () => {
    await rotateToken(COCKPIT_DIR);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
