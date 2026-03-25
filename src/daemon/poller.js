import { readConfig } from '../config/index.js';
import { pollRepo } from '../github/watcher.js';
import { pollActivePr } from '../github/pr-watcher.js';
import { createClient, RateLimitError } from '../github/client.js';
import { runNextJob, runNextPrReview } from './job-runner.js';
import { listActivePrs } from '../db/prs.js';
import { requeueExpiredRateLimited } from '../db/jobs.js';
import { expandHome } from '../config/index.js';

const COCKPIT_DIR = expandHome('~/.cockpit');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startPollLoop(db, opts = {}) {
  const getShuttingDown = opts.getShuttingDown || (() => false);

  while (!getShuttingDown()) {
    let config;
    try {
      config = readConfig(COCKPIT_DIR);
    } catch (err) {
      console.error(`Failed to read config: ${err.message}`);
      await sleep(30000);
      continue;
    }

    const octokit = createClient(config.githubToken);

    // Requeue any rate-limited jobs whose reset time has passed
    const requeued = requeueExpiredRateLimited(db);
    if (requeued > 0) console.log(`[cockpit] Requeued ${requeued} rate-limited job(s)`);

    // Poll each repo
    for (const repoEntry of config.repos) {
      if (getShuttingDown()) break;

      if (!repoEntry.localPath) {
        console.warn(`Skipping repo ${repoEntry.repo}: localPath not configured`);
        continue;
      }

      try {
        await pollRepo(octokit, db, repoEntry.repo, repoEntry.localPath, config.githubOwner);
      } catch (err) {
        if (err instanceof RateLimitError) {
          console.warn(`Rate limited. Sleeping ${Math.ceil(err.waitMs / 1000)}s...`);
          await sleep(err.waitMs);
          break;
        }
        console.error(`Error polling ${repoEntry.repo}: ${err.message}`);
      }
    }

    // Poll active PRs for new review comments
    if (!getShuttingDown()) {
      const activePrs = listActivePrs(db);
      for (const pr of activePrs) {
        if (getShuttingDown()) break;
        try {
          await pollActivePr(octokit, db, pr, config.githubOwner);
        } catch (err) {
          if (err instanceof RateLimitError) {
            console.warn(`Rate limited polling PR #${pr.pr_number}. Sleeping ${Math.ceil(err.waitMs / 1000)}s...`);
            await sleep(err.waitMs);
            break;
          }
          console.error(`Error polling PR #${pr.pr_number} (${pr.github_repo}): ${err.message}`);
        }
      }
    }

    if (!getShuttingDown()) {
      // Run next queued job (if any)
      try {
        await runNextJob(db, octokit, config);
      } catch (err) {
        console.error(`Job runner error: ${err.message}`);
      }
    }

    // Run next queued PR review job (if any)
    if (!getShuttingDown()) {
      try {
        await runNextPrReview(db, octokit, config);
      } catch (err) {
        if (err instanceof RateLimitError) {
          console.warn(`Rate limited during PR review. Sleeping ${Math.ceil(err.waitMs / 1000)}s...`);
          await sleep(err.waitMs);
        } else {
          console.error(`PR review runner error: ${err.message}`);
        }
      }
    }

    const intervalMs = (config.pollIntervalSeconds ?? 30) * 1000;
    await sleep(intervalMs);
  }
}
