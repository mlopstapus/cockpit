import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { markPrReviewComplete, resetPrReviewToQueued } from '../db/pr-reviews.js';
import { postPRComment } from '../github/commenter.js';
import { RateLimitError } from '../github/client.js';

const CLAUDE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Count how many comment sections are in a batched comment_body
function countComments(body) {
  if (!body) return 0;
  return (body.split('\n\n---\n\n').length);
}

// Run a one-shot Claude invocation (new session, no --continue).
// Returns the full output string. Throws on non-zero exit or timeout.
function runClaude(claudeBin, repoPath, prompt, onLine, spawnFn) {
  return new Promise((resolve, reject) => {
    const args = ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'text'];
    const spawnImpl = spawnFn || spawn;
    const proc = spawnImpl(claudeBin, args, { cwd: repoPath, env: process.env });

    let buf = '';
    let output = '';
    const handleChunk = (chunk) => {
      const text = chunk.toString();
      output += text;
      buf += text;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) onLine(line);
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Claude timed out after ${Math.round(CLAUDE_TIMEOUT_MS / 60000)}m`));
    }, CLAUDE_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (buf) { onLine(buf); output += buf; }
      if (code === 0) resolve(output);
      else reject(new Error(`claude exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

// Commit and push all changes in repoPath.
function gitPush(repoPath, execFileFn) {
  const execImpl = execFileFn || ((bin, args, opts, cb) => execFile(bin, args, opts, cb));
  return new Promise((resolve, reject) => {
    execImpl(
      '/bin/sh',
      ['-c', 'git add -A && git commit -m "Apply PR review feedback" && git push'],
      { timeout: 60000, cwd: repoPath },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
}

/**
 * Execute one PR review job:
 *  1. Post acknowledgement comment on PR
 *  2. Run Claude with comment body as prompt
 *  3. Commit + push changes
 *  4. Post success/failure comment
 *  5. Update job status
 *
 * @param {object} db
 * @param {object} review  - Row from pr_review_jobs (status='active')
 * @param {object} octokit
 * @param {object} config
 * @param {object} opts    - { claudeBin, spawnFn, execFileFn } for testing
 */
export async function executePrReview(db, review, octokit, config, opts = {}) {
  const claudeBin = opts.claudeBin || 'claude';
  const { spawnFn, execFileFn } = opts;

  const log = (line) => console.log(`[pr-review:${review.id}] ${line}`);
  const count = countComments(review.comment_body);

  // Step 1: Acknowledge
  try {
    await postPRComment(
      octokit,
      review.github_repo,
      review.pr_number,
      `👀 Received ${count} comment(s) — implementing now…`
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      resetPrReviewToQueued(db, review.id);
      throw err;
    }
    // Non-fatal: log and continue even if ack fails
    log(`[cockpit] Failed to post acknowledgement: ${err.message}`);
  }

  // Step 2: Run Claude
  try {
    const prompt = `You are implementing changes requested via PR review comments.\n\nReview comments to address:\n\n${review.comment_body}`;
    log(`[cockpit] PR review job ${review.id}: running Claude`);
    await runClaude(claudeBin, review.repo_path, prompt, (line) => log(line), spawnFn);
  } catch (err) {
    log(`[cockpit] Claude failed: ${err.message}`);
    await postPRComment(
      octokit,
      review.github_repo,
      review.pr_number,
      `❌ Implementation failed: ${err.message}. Will retry next cycle.`
    ).catch(() => {});
    resetPrReviewToQueued(db, review.id);
    return;
  }

  // Step 3: Commit + push
  try {
    log(`[cockpit] PR review job ${review.id}: pushing changes`);
    await gitPush(review.repo_path, execFileFn);
  } catch (err) {
    log(`[cockpit] git push failed: ${err.message}`);
    await postPRComment(
      octokit,
      review.github_repo,
      review.pr_number,
      `❌ Implementation failed: git push rejected — ${err.message}. Will retry next cycle.`
    ).catch(() => {});
    resetPrReviewToQueued(db, review.id);
    return;
  }

  // Step 4: Success
  await postPRComment(
    octokit,
    review.github_repo,
    review.pr_number,
    `✅ Changes pushed to branch`
  ).catch((err) => log(`[cockpit] Failed to post success comment: ${err.message}`));

  markPrReviewComplete(db, review.id);
  log(`[cockpit] PR review job ${review.id}: completed`);
}
