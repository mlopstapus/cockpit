import { readConfig } from '../config/index.js';
import { pollRepo } from '../github/watcher.js';
import { createClient, RateLimitError } from '../github/client.js';
import { runNextJob } from './job-runner.js';
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

    if (!getShuttingDown()) {
      // Run next queued job (if any)
      try {
        await runNextJob(db, octokit, config);
      } catch (err) {
        console.error(`Job runner error: ${err.message}`);
      }
    }

    const intervalMs = (config.pollIntervalSeconds ?? 30) * 1000;
    await sleep(intervalMs);
  }
}
