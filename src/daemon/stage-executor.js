import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClaudeProcess, detectSentinel, extractPrUrl } from '../process/claude-process.js';
import { postIssueComment, listIssueComments } from '../github/commenter.js';
import { isCommentSeen, markCommentSeen } from '../db/comments.js';
import { registerActivePr } from '../db/prs.js';
import { appendLog } from '../db/logs.js';
import { markFailed, markComplete } from '../db/jobs.js';

const execFileAsync = promisify(execFile);

export function redactSecrets(line, token) {
  if (!token || !line) return line;
  return line.split(token).join('[REDACTED]');
}

const STAGE_LABELS = {
  specify:   '🔍 specify',
  clarify:   '💬 clarify',
  plan:      '📐 plan',
  tasks:     '📋 tasks',
  analyze:   '🔎 analyze',
  implement: '🔨 implement',
};

export async function executeJob(db, job, octokit, config, opts = {}) {
  const spawnFn = opts.spawnOverride || createClaudeProcess();

  // Post "picked up" comment
  try {
    await postIssueComment(
      octokit,
      job.github_repo,
      job.issue_number,
      `🚀 **Cockpit picked up issue #${job.issue_number}**: *${job.spec_name}*\n\nRunning spec-kit pipeline… I'll post updates as each stage completes.`
    );
  } catch (err) {
    console.error(`Failed to post picked-up comment: ${err.message}`);
  }

  const proc = spawnFn(job.repo_path, undefined, [], { timeoutMs: 45 * 60 * 1000 });

  let clarifyRelayInterval = null;
  let clarifyStartedAt = null;
  let prUrl = null;

  const cleanupClarify = () => {
    if (clarifyRelayInterval) {
      clearInterval(clarifyRelayInterval);
      clarifyRelayInterval = null;
    }
  };

  const startClarifyRelay = () => {
    if (clarifyRelayInterval) return;
    clarifyStartedAt = new Date().toISOString();
    clarifyRelayInterval = setInterval(async () => {
      try {
        const comments = await listIssueComments(
          octokit, job.github_repo, job.issue_number, clarifyStartedAt
        );
        for (const comment of comments) {
          if (!isCommentSeen(db, job.id, comment.id)) {
            markCommentSeen(db, job.id, comment.id);
            proc.write(comment.body + '\n');
          }
        }
      } catch (err) {
        console.error(`Clarify relay error: ${err.message}`);
      }
    }, 10000);
  };

  // Single combined data handler: log + sentinel + PR URL detection
  proc.onData((line) => {
    // Redact token before storage
    appendLog(db, job.id, redactSecrets(line, config.githubToken));

    const stage = detectSentinel(line);
    if (stage) {
      const label = STAGE_LABELS[stage] || stage;
      postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `✅ **Stage complete**: ${label}`
      ).catch(err => console.error(`Failed to post stage comment: ${err.message}`));

      if (stage === 'clarify') {
        startClarifyRelay();
      } else {
        cleanupClarify();
      }
    }

    // Extract PR URL from output
    const url = extractPrUrl(line);
    if (url && !prUrl) {
      prUrl = url;
      const prNumber = parseInt(url.match(/\/pull\/(\d+)/)?.[1] || '0', 10);
      if (prNumber > 0) {
        registerActivePr(db, {
          github_repo: job.github_repo,
          pr_number: prNumber,
          job_id: job.id,
          issue_number: job.issue_number,
          repo_path: job.repo_path,
          registered_at: new Date().toISOString(),
        });
      }
      postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `🎉 **PR opened**: ${url}`
      ).catch(err => console.error(`Failed to post PR link: ${err.message}`));
    }
  });

  const exitCode = await new Promise((resolve) => {
    proc.onExit((code) => resolve(code));

    // Write the spec-kit pipeline command to Claude's stdin
    proc.write(
      `cd "${job.repo_path}" && ` +
      `specify --here --ai claude && ` +
      `specify clarify --ai claude && ` +
      `specify plan --ai claude && ` +
      `specify tasks --ai claude && ` +
      `specify analyze --ai claude && ` +
      `specify implement --ai claude\n`
    );
  });

  cleanupClarify();

  if (exitCode !== 0) {
    markFailed(db, job.id, `Claude exited with code ${exitCode}`);
    await postIssueComment(
      octokit, job.github_repo, job.issue_number,
      `❌ **Pipeline failed** (exit code ${exitCode}). Check \`cockpit logs ${job.id}\` for details.`
    ).catch(() => {});
  } else {
    markComplete(db, job.id);

    // Post-implement hook
    if (config.postImplementCommand) {
      try {
        const hookOpts = { timeout: 30000 };
        try {
          const { existsSync } = await import('node:fs');
          if (existsSync(job.repo_path)) hookOpts.cwd = job.repo_path;
        } catch {}
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', config.postImplementCommand], hookOpts);
        const output = (stdout || '').trim();
        await postIssueComment(
          octokit, job.github_repo, job.issue_number,
          `✅ **Post-implement hook completed**:\n\`\`\`\n${output}\n\`\`\``
        ).catch(() => {});
      } catch (err) {
        const code = err.code || 'unknown';
        const stderr = (err.stderr || err.message || '').trim();
        await postIssueComment(
          octokit, job.github_repo, job.issue_number,
          `⚠️ **Post-implement hook failed** (exit ${code}):\n\`\`\`\n${stderr}\n\`\`\``
        ).catch(() => {});
      }
    }
  }
}
