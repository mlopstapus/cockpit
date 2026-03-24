import { enqueueJob } from '../db/jobs.js';
import { makeJobId } from '../db/jobs.js';
import { RateLimitError } from './client.js';

// Strip control characters except newlines
function sanitise(str) {
  if (!str) return str;
  return str.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
}

export { RateLimitError };

export async function pollRepo(octokit, db, repoFullName, localPath, owner, logger = console) {
  if (!localPath) {
    logger.warn(`Skipping repo ${repoFullName}: localPath is not configured`);
    return;
  }

  const [repoOwner, repoName] = repoFullName.split('/');

  let data;
  try {
    const response = await octokit.issues.listForRepo({
      owner: repoOwner,
      repo: repoName,
      state: 'open',
      per_page: 100,
    });
    data = response.data;
  } catch (err) {
    if (err.status === 429 || err.status === 403) {
      const resetHeader = err.response?.headers?.['x-ratelimit-reset'];
      const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : Date.now() + 60000;
      const waitMs = Math.max(0, resetAt - Date.now());
      throw new RateLimitError(waitMs);
    }
    throw err;
  }

  for (const issue of data) {
    // Skip PRs
    if (issue.pull_request) continue;
    // Filter by title prefix
    if (!issue.title.startsWith('[COCKPIT]')) continue;
    // Filter by owner
    if (issue.user?.login !== owner) continue;

    const specName = issue.title.replace(/^\[COCKPIT\]\s*/, '').trim();
    const job = {
      id: makeJobId(),
      github_repo: repoFullName,
      issue_number: issue.number,
      issue_title: sanitise(issue.title),
      issue_body: sanitise(issue.body || ''),
      spec_name: specName,
      repo_path: localPath,
      stage: 'idle',
      status: 'queued',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    enqueueJob(db, job);
  }
}
