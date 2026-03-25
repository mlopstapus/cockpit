import { retryJob, getLastFailedJob } from '../db/jobs.js';
import chalk from 'chalk';

/**
 * Requeue a failed job for re-execution.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string|undefined} jobId  - explicit job ID (mutually exclusive with opts.last)
 * @param {{ last?: boolean }} opts
 * @param {{ log?: Function, error?: Function, exit?: Function }} io - injectable for testing
 */
export function retryFailedJob(db, jobId, opts = {}, io = {}) {
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const exit = io.exit ?? process.exit;

  if (jobId && opts.last) {
    error('Error: cannot specify both a job ID and --last');
    return exit(1);
  }

  if (opts.last && !jobId) {
    const last = getLastFailedJob(db);
    if (!last) {
      error('Error: no failed jobs found');
      return exit(1);
    }
    jobId = last.id;
  }

  if (!jobId) {
    error('Error: provide a job ID or use --last');
    return exit(1);
  }

  const result = retryJob(db, jobId);

  if (!result.success) {
    if (result.reason === 'not_found') {
      error(`Error: job '${jobId}' not found`);
    } else {
      error(`Error: job '${jobId}' is not in a failed state (current status: ${result.status})`);
    }
    return exit(1);
  }

  log(chalk.green('✓') + ` Job ${result.job.id} requeued (resuming from stage: ${result.job.stage})`);
}
