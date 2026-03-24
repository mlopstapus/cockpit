import { listPRComments, BOT_COMMENT_PREFIXES } from './commenter.js';
import { deregisterPr, isPrCommentSeen, markPrCommentSeen } from '../db/prs.js';
import { enqueuePrReview } from '../db/pr-reviews.js';
import { makeJobId } from '../db/jobs.js';
import { RateLimitError } from './client.js';

function isBotComment(body) {
  if (!body) return true;
  return BOT_COMMENT_PREFIXES.some(p => body.startsWith(p));
}

// Strip control characters except newlines — mirrors sanitise() in watcher.js
function sanitise(str) {
  if (!str) return str;
  return str.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
}

/**
 * Poll a single active PR for new owner comments. For each batch of new
 * actionable comments found, enqueue one pr_review_job.
 *
 * @param {object} octokit  - Octokit instance
 * @param {object} db       - SQLite database handle
 * @param {object} pr       - Row from active_prs table
 * @param {string} githubOwner - Only process comments from this login
 */
export async function pollActivePr(octokit, db, pr, githubOwner) {
  const [owner, repo] = pr.github_repo.split('/');

  // Check PR state — deregister if closed/merged
  let prData;
  try {
    const response = await octokit.pulls.get({ owner, repo, pull_number: pr.pr_number });
    prData = response.data;
  } catch (err) {
    if (err.status === 429 || err.status === 403) {
      const resetHeader = err.response?.headers?.['x-ratelimit-reset'];
      const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : Date.now() + 60000;
      throw new RateLimitError(Math.max(0, resetAt - Date.now()));
    }
    throw err;
  }

  if (prData.state === 'closed') {
    console.log(`[cockpit] PR #${pr.pr_number} (${pr.github_repo}) merged/closed — deregistering`);
    deregisterPr(db, pr.github_repo, pr.pr_number);
    return;
  }

  // Fetch comments
  let comments;
  try {
    comments = await listPRComments(octokit, pr.github_repo, pr.pr_number);
  } catch (err) {
    if (err.status === 304) return; // ETag cache hit — no new comments
    if (err.status === 429 || err.status === 403) {
      const resetHeader = err.response?.headers?.['x-ratelimit-reset'];
      const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : Date.now() + 60000;
      throw new RateLimitError(Math.max(0, resetAt - Date.now()));
    }
    throw err;
  }

  // Filter to actionable comments
  const batch = [];
  for (const comment of comments) {
    if (comment.user?.login !== githubOwner) continue;
    if (isBotComment(comment.body)) continue;
    if (isPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id))) continue;

    const sanitisedBody = sanitise(comment.body);
    markPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id));
    batch.push({ id: comment.id, body: sanitisedBody });
  }

  if (batch.length === 0) return;
  console.log(`[cockpit] PR comment poll: found ${batch.length} new comment(s) on PR #${pr.pr_number} (${pr.github_repo})`);

  // Batch all comment bodies into a single review job
  const combinedBody = batch.map(c => c.body).join('\n\n---\n\n');

  enqueuePrReview(db, {
    id: makeJobId(),
    github_repo: pr.github_repo,
    pr_number: pr.pr_number,
    issue_number: pr.issue_number,
    repo_path: pr.repo_path,
    comment_id: String(batch[0].id),
    comment_body: combinedBody,
    pr_url: pr.pr_url || `https://github.com/${pr.github_repo}/pull/${pr.pr_number}`,
    status: 'queued',
    created_at: new Date().toISOString(),
  });
}
