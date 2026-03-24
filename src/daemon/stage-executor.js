import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { extractPrUrl } from '../process/claude-process.js';
import { postIssueComment, listIssueComments } from '../github/commenter.js';
import { registerActivePr } from '../db/prs.js';
import { appendLog } from '../db/logs.js';
import { markFailed, markComplete, markStage } from '../db/jobs.js';

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

// artifact: file that signals the stage's background agent completed.
const STAGES = [
  { name: 'specify',   message: (job) => `/speckit.specify ${job.spec_name}: ${job.issue_body}`, artifact: 'spec.md' },
  { name: 'clarify',   message: () => '/speckit.clarify',   artifact: null },
  { name: 'plan',      message: () => '/speckit.plan',      artifact: 'plan.md' },
  { name: 'tasks',     message: () => '/speckit.tasks',     artifact: 'tasks.md' },
  { name: 'analyze',   message: () => '/speckit.analyze',   artifact: null },
  { name: 'implement', message: () => '/speckit.implement', artifact: null },
];

// Speckit background agents write files after claude -p exits — poll until it appears.
// Only accepts files newer than newerThanMs to avoid matching stale artifacts from prior runs.
async function waitForArtifact(repoPath, filename, log, maxWaitMs = 3 * 60 * 1000, newerThanMs = Date.now()) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const specsDir = path.join(repoPath, 'specs');
    if (fs.existsSync(specsDir)) {
      for (const entry of fs.readdirSync(specsDir)) {
        const candidate = path.join(specsDir, entry, filename);
        try {
          const stat = fs.statSync(candidate);
          if (stat.mtimeMs >= newerThanMs) return candidate;
        } catch {}
      }
    }
    const root = path.join(repoPath, filename);
    try {
      const stat = fs.statSync(root);
      if (stat.mtimeMs >= newerThanMs) return root;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  log(`[cockpit] Timed out waiting for ${filename}`);
  return null;
}

const CLARIFY_POLL_MS     = 30 * 1000;            // poll every 30s for answers
const CLARIFY_TIMEOUT_MS  = 24 * 60 * 60 * 1000;  // 24h max wait per question

// Signals that the clarify skill has no more questions
const CLARIFY_DONE_RE = /no clarification needed|clarif(?:y|ication)(?:\s+is)?\s+complete|all questions answered|ready to proceed|no (?:further |more )?questions/i;

function isClarifyDone(output) {
  return CLARIFY_DONE_RE.test(output);
}

function isHumanComment(c) {
  const prefixes = ['💬', '🚀', '✅', '❌', '⚠️', '🎉'];
  return !prefixes.some(p => c.body.startsWith(p));
}

// Wait for the next human reply after `since` timestamp. Returns body text or null on timeout.
async function waitForNextReply(octokit, repoFullName, issueNumber, since, log) {
  const deadline = Date.now() + CLARIFY_TIMEOUT_MS;
  const seen = new Set();

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, CLARIFY_POLL_MS));
    try {
      const comments = await listIssueComments(octokit, repoFullName, issueNumber, since)
        .catch(err => (err.status === 304 ? [] : Promise.reject(err)));
      const fresh = comments.filter(c => isHumanComment(c) && !seen.has(c.id));
      if (fresh.length > 0) {
        fresh.forEach(c => seen.add(c.id));
        return fresh.map(c => c.body).join('\n\n');
      }
    } catch (err) {
      log(`[cockpit] Error polling for clarify reply: ${err.message}`);
    }
  }
  return null;
}

// Run a single stage via `claude --dangerously-skip-permissions -p <message>`.
// No PTY — bypass-permissions prompt never appears.
// continueSession=true resumes the most recent session in repoPath.
// Returns full stdout+stderr output.
function runClaudeStage(claudeBin, repoPath, message, onLine, { timeoutMs = 30 * 60 * 1000, continueSession = false, spawnFn } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--dangerously-skip-permissions', '-p', message, '--output-format', 'text'];
    if (continueSession) args.push('--continue');
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
      reject(new Error(`Stage timed out after ${Math.round(timeoutMs / 60000)}m`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (buf) { onLine(buf); output += buf; }
      if (code === 0) resolve(output);
      else reject(new Error(`claude exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

// Clarify Q&A loop: post question → wait for answer → feed answer back via --continue → repeat.
async function runClarifyLoop(claudeBin, repoPath, firstOutput, octokit, repoFullName, issueNumber, log, spawnFn) {
  let output = firstOutput;

  while (true) {
    if (isClarifyDone(output)) {
      log(`[cockpit] Clarify complete — no more questions`);
      break;
    }

    // Strip internal noise before posting to GitHub
    const NOISE_RE = /^Warning:|^\[cockpit\]|^Coverage scan|^✓|^\s*\d+ (files? scanned|test)/i;
    const question = output
      .split('\n')
      .filter(l => !NOISE_RE.test(l.trim()))
      .join('\n')
      .trim();

    if (!question) break;

    await postIssueComment(octokit, repoFullName, issueNumber, `💬 ${question}`)
      .catch(err => log(`[cockpit] Failed to post question: ${err.message}`));

    const since = new Date().toISOString();
    log(`[cockpit] Waiting for answer…`);
    const answer = await waitForNextReply(octokit, repoFullName, issueNumber, since, log);

    if (!answer) {
      log(`[cockpit] No answer received within timeout, proceeding`);
      break;
    }

    log(`[cockpit] Got answer, feeding back to clarify…`);
    output = await runClaudeStage(claudeBin, repoPath, answer, (l) => log(l), { continueSession: true, spawnFn })
      .catch(err => { log(`[cockpit] Clarify continue error: ${err.message}`); return ''; });
  }
}

export async function executeJob(db, job, octokit, config, opts = {}) {
  const claudeBin = opts.claudeBin || 'claude';
  const spawnFn = opts.spawnFn || null;

  try {
    await postIssueComment(
      octokit, job.github_repo, job.issue_number,
      `🚀 **Cockpit picked up issue #${job.issue_number}**: *${job.spec_name}*\n\nRunning spec-kit pipeline… I'll post updates as each stage completes.`
    );
  } catch (err) {
    console.error(`Failed to post picked-up comment: ${err.message}`);
  }

  const log = (line) => appendLog(db, job.id, redactSecrets(line, config.githubToken));

  // Find the resume point: if job.stage is set, skip stages before it
  const resumeFromStage = (job.stage && job.stage !== 'idle') ? job.stage : null;
  const resumeIdx = resumeFromStage ? STAGES.findIndex(s => s.name === resumeFromStage) : 0;
  if (resumeFromStage) log(`[cockpit] Resuming from stage: ${resumeFromStage}`);

  for (const stage of STAGES) {
    const stageIdx = STAGES.findIndex(s => s.name === stage.name);
    if (stageIdx < resumeIdx) continue; // skip already-completed stages

    log(`[cockpit] Starting stage: ${stage.name}`);

    // Only skip --continue for specify on a fresh (non-resumed) run
    const isFirstStage = stage.name === 'specify' && !resumeFromStage;
    markStage(db, job.id, stage.name);
    const stageStartMs = Date.now();
    let prUrl = null;
    let stageOutput = '';

    try {
      stageOutput = await runClaudeStage(claudeBin, job.repo_path, stage.message(job), (line) => {
        log(line);
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
          postIssueComment(octokit, job.github_repo, job.issue_number, `🎉 **PR opened**: ${url}`)
            .catch(() => {});
        }
      }, { continueSession: !isFirstStage, spawnFn });
    } catch (err) {
      log(`[cockpit] Stage ${stage.name} failed: ${err.message}`);
      markFailed(db, job.id, `Stage ${stage.name} failed: ${err.message}`);
      await postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `❌ **Stage ${STAGE_LABELS[stage.name] || stage.name} failed**: ${err.message}\n\nCheck \`cockpit logs ${job.id}\` for details.`
      ).catch(() => {});
      return;
    }

    // Wait for artifact if the skill runs as a background agent
    if (stage.artifact) {
      log(`[cockpit] Waiting for ${stage.artifact}…`);
      // Skip mtime check when using a mock spawnFn (tests pre-write artifacts)
      const newerThan = spawnFn ? 0 : stageStartMs;
      const found = await waitForArtifact(job.repo_path, stage.artifact, log, 3 * 60 * 1000, newerThan);
      if (!found) log(`[cockpit] ${stage.artifact} never appeared — stage may have failed silently`);
    }

    // Clarify: iterative Q&A loop — waits for human responses
    if (stage.name === 'clarify') {
      await runClarifyLoop(claudeBin, job.repo_path, stageOutput, octokit, job.github_repo, job.issue_number, log, spawnFn);
    }

    // Analyze: automatically remediate all issues before proceeding to implement
    if (stage.name === 'analyze') {
      log(`[cockpit] Analyze complete — remediating all issues…`);
      await runClaudeStage(claudeBin, job.repo_path, 'remediate all issues', (line) => log(line), { continueSession: true, spawnFn })
        .catch(err => log(`[cockpit] Analyze remediation error: ${err.message}`));
    }

    await postIssueComment(
      octokit, job.github_repo, job.issue_number,
      `✅ **Stage complete**: ${STAGE_LABELS[stage.name] || stage.name}`
    ).catch(err => console.error(`Failed to post stage comment: ${err.message}`));
  }

  markComplete(db, job.id);

  if (config.postImplementCommand) {
    try {
      const { stdout } = await execFileAsync('/bin/sh', ['-c', config.postImplementCommand], {
        timeout: 30000, cwd: job.repo_path,
      });
      await postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `✅ **Post-implement hook completed**:\n\`\`\`\n${(stdout || '').trim()}\n\`\`\``
      ).catch(() => {});
    } catch (err) {
      const stderr = (err.stderr || err.message || '').trim();
      await postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `⚠️ **Post-implement hook failed** (exit ${err.code || 'unknown'}):\n\`\`\`\n${stderr}\n\`\`\``
      ).catch(() => {});
    }
  }

  // Per-repo startup command — runs after global postImplementCommand, never marks job failed
  const repoConfig = (config.repos || []).find(r => r.repo === job.github_repo);
  if (repoConfig?.startupCommand) {
    const startMs = Date.now();
    try {
      const { stdout } = await execFileAsync('/bin/sh', ['-c', repoConfig.startupCommand], {
        timeout: 5 * 60 * 1000, cwd: job.repo_path,
      });
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      await postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `✅ **Startup command completed** (${elapsed}s):\n\`\`\`\n${(stdout || '').trim()}\n\`\`\``
      ).catch(() => {});
    } catch (err) {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      const stderr = (err.stderr || err.message || '').trim();
      await postIssueComment(
        octokit, job.github_repo, job.issue_number,
        `⚠️ **Startup command failed** (exit ${err.code || 'unknown'}, ${elapsed}s):\n\`\`\`\n${stderr}\n\`\`\``
      ).catch(() => {});
    }
  }
}
