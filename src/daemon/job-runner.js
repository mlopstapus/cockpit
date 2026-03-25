import { dequeueJob, markActive, markComplete, markFailed } from '../db/jobs.js';
import { appendLog } from '../db/logs.js';
import { executeJob, redactSecrets } from './stage-executor.js';
import { dequeuePrReview, resetPrReviewToQueued } from '../db/pr-reviews.js';
import { executePrReview } from './pr-review-executor.js';

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

export async function runNextPrReview(db, octokit, config) {
  const review = dequeuePrReview(db);
  if (!review) return;

  try {
    await executePrReview(db, review, octokit, config);
  } catch (err) {
    console.error(`[pr-review:${review.id}] FATAL: ${err.message}`);
    resetPrReviewToQueued(db, review.id);
  }
}
