import { dequeueJob, markActive, markComplete, markFailed } from '../db/jobs.js';
import { appendLog } from '../db/logs.js';
import { executeJob, redactSecrets } from './stage-executor.js';

export async function runNextJob(db, octokit, config) {
  const job = dequeueJob(db);
  if (!job) return;

  markActive(db, job.id);

  try {
    await executeJob(db, job, octokit, config);
  } catch (err) {
    const msg = err.message || String(err);
    appendLog(db, job.id, redactSecrets(`[FATAL] ${msg}`, config.githubToken));
    markFailed(db, job.id, msg);
  }
}
