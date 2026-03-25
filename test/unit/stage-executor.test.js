import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, makeJobId, getJob } from '../../src/db/jobs.js';
import { getLogTail } from '../../src/db/logs.js';
import { executeJob } from '../../src/daemon/stage-executor.js';

// ---------- helpers ----------

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-stage-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-repo-test-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function makeJob(repoPath, overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: 42,
    issue_title: '[COCKPIT] test feature',
    issue_body: 'test',
    spec_name: 'test feature',
    repo_path: repoPath,
    stage: 'idle',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOctokit() {
  const comments = [];
  const prs = [];
  return {
    comments,
    prs,
    issues: {
      createComment: async ({ owner, repo, issue_number, body }) => {
        comments.push({ owner, repo, issue_number, body });
        return { data: { id: comments.length } };
      },
      listComments: async () => ({ data: [] }),
    },
    pulls: {
      create: async ({ owner, repo }) => {
        const pr = { number: prs.length + 1, html_url: `https://github.com/${owner}/${repo}/pull/${prs.length + 1}` };
        prs.push(pr);
        return { data: pr };
      },
    },
  };
}

// Mock gitFn that returns a fake feature branch and succeeds for all git/shell calls.
function makeGitFn(branch = 'feature/test-feature') {
  return async (bin, args) => {
    if (bin === 'git' && args.includes('--show-current')) {
      return { stdout: branch, stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

// SpawnFn that succeeds for all stages except the one at failIdx (0-based).
function makeSpawnFnFailAt(failIdx) {
  let call = 0;
  return () => {
    const exitCode = call === failIdx ? 1 : 0;
    const lines = call === 1 ? ['no clarification needed'] : [];
    call++;
    return makeChildProcess(lines, exitCode);
  };
}

function makeConfig(token = 'ghp_testtoken123', overrides = {}) {
  return {
    githubToken: token,
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos: [{ repo: 'owner/repo', localPath: '/repos/test' }],
    ...overrides,
  };
}

// Create a child-process-style mock that emits lines then closes.
function makeChildProcess(lines = [], exitCode = 0) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};
  setImmediate(() => {
    for (const line of lines) proc.stdout.emit('data', Buffer.from(line + '\n'));
    proc.emit('close', exitCode);
  });
  return proc;
}

// spawnFn factory: each call gets the next entry in perCallLines (wraps with empty array if exhausted).
// clarifyCallIdx: the 0-based call index that is the clarify stage — auto-emits done signal.
function makeSpawnFn(perCallLines = []) {
  let call = 0;
  return () => {
    const lines = perCallLines[call] ?? [];
    call++;
    return makeChildProcess(lines, 0);
  };
}

function makeFailingSpawnFn() {
  return () => makeChildProcess([], 1);
}

// Pre-write artifact files so waitForArtifact returns immediately.
function writeArtifacts(repoPath, ...filenames) {
  for (const f of filenames) fs.writeFileSync(path.join(repoPath, f), `# ${f}\n`);
}

// ---------- Phase 1 baseline tests ----------

describe('executeJob — happy path (6 stages)', () => {
  test('posts picked-up comment and stage-complete comments for all stages', async () => {
    const { db, cleanup: dbCleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // 6 stages; clarify (index 1) emits done signal so Q&A loop exits immediately
    const spawnFn = makeSpawnFn([
      [],                          // specify
      ['no clarification needed'], // clarify
      [],                          // plan
      [],                          // tasks
      [],                          // analyze
      [],                          // implement
    ]);

    await executeJob(db, job, octokit, config, { spawnFn });

    // picked-up comment + 6 stage-complete comments = at least 7
    assert.ok(octokit.comments.length >= 7, `Expected >=7 comments, got ${octokit.comments.length}`);
    const bodies = octokit.comments.map(c => c.body);
    assert.ok(bodies[0].toLowerCase().includes('picked up') || bodies[0].toLowerCase().includes('running'));
    assert.ok(bodies.some(b => b.includes('✅') && b.includes('implement')));

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');

    dbCleanup(); repoCleanup();
  });
});

describe('executeJob — failure path', () => {
  test('marks job failed and posts error comment on non-zero exit', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 99 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    await executeJob(db, job, octokit, config, { spawnFn: makeFailingSpawnFn() });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed');
    assert.ok(octokit.comments.some(c => c.body.includes('❌') || c.body.toLowerCase().includes('fail')));

    cleanup(); repoCleanup();
  });
});

describe('executeJob — token redaction', () => {
  test('GitHub token is redacted in job logs', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const token = 'ghp_supersecrettoken999';
    const job = makeJob(repoPath, { issue_number: 77 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig(token);

    // specify stage emits a line containing the token
    const spawnFn = makeSpawnFn([
      [`Using token ${token} for auth`], // specify
      ['no clarification needed'],       // clarify
      [], [], [], [],
    ]);

    await executeJob(db, job, octokit, config, { spawnFn });

    const logs = getLogTail(db, job.id, 100);
    for (const line of logs) {
      assert.ok(!line.includes(token), `Token found unredacted in: "${line}"`);
    }
    assert.ok(logs.some(l => l.includes('[REDACTED]')));

    cleanup(); repoCleanup();
  });
});

describe('executeJob — post-implement hook', () => {
  test('fires when postImplementCommand is set after all stages complete', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath, { issue_number: 300 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', { postImplementCommand: 'echo "hook ran"' });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(octokit.comments.some(c => c.body.includes('✅') && c.body.toLowerCase().includes('hook')));
    cleanup(); repoCleanup();
  });

  test('skipped when postImplementCommand is empty', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath, { issue_number: 301 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', { postImplementCommand: '' });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(!octokit.comments.some(c =>
      c.body.toLowerCase().includes('post-implement hook') ||
      (c.body.includes('✅') && c.body.toLowerCase().includes('hook'))
    ));
    cleanup(); repoCleanup();
  });

  test('job remains completed even if hook fails', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath, { issue_number: 302 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', { postImplementCommand: 'exit 42' });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');
    assert.ok(octokit.comments.some(c => c.body.includes('⚠️')));
    cleanup(); repoCleanup();
  });
});

// ---------- T004: deploy instruction injected into implement prompt ----------

describe('executeJob — deploy instruction in implement prompt', () => {
  test('redeploy instruction is always appended to the implement stage prompt', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const capturedPrompts = [];
    const spawnFn = (bin, args) => {
      const pFlag = args.indexOf('-p');
      if (pFlag !== -1) capturedPrompts.push(args[pFlag + 1]);
      return makeChildProcess(capturedPrompts.length === 2 ? ['no clarification needed'] : [], 0);
    };

    await executeJob(db, job, octokit, config, { spawnFn });

    const implementPrompt = capturedPrompts.find(p => p.includes('/speckit.implement'));
    assert.ok(implementPrompt, 'implement stage should have been called');
    assert.ok(implementPrompt.includes('recompile and redeploy'),
      'implement prompt should include redeploy instruction');
    cleanup(); repoCleanup();
  });

  test('redeploy instruction is NOT appended to non-implement stages', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const capturedPrompts = [];
    const spawnFn = (bin, args) => {
      const pFlag = args.indexOf('-p');
      if (pFlag !== -1) capturedPrompts.push(args[pFlag + 1]);
      return makeChildProcess(capturedPrompts.length === 2 ? ['no clarification needed'] : [], 0);
    };

    await executeJob(db, job, octokit, config, { spawnFn });

    const nonImplementPrompts = capturedPrompts.filter(p => !p.includes('/speckit.implement'));
    for (const p of nonImplementPrompts) {
      assert.ok(!p.includes('recompile'), `non-implement prompt should not include redeploy: ${p.slice(0, 50)}`);
    }
    cleanup(); repoCleanup();
  });
});

// ---------- PR guarantee tests ----------

describe('executeJob — draft PR guarantee on implement failure', () => {
  test('opens draft PR when implement stage fails and includes URL in failure comment', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();
    // implement is call index 6 (analyze fires twice: stage + remediation)
    const spawnFn = makeSpawnFnFailAt(6);
    const gitFn = makeGitFn('feature/test-feature');

    await executeJob(db, job, octokit, config, { spawnFn, gitFn });

    // Job should be marked failed
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed');

    // A draft PR should have been created
    assert.equal(octokit.prs.length, 1, 'Expected one draft PR to be created');

    // The failure comment should mention the draft PR URL
    const failComment = octokit.comments.find(c => c.body.includes('❌') && c.body.toLowerCase().includes('implement'));
    assert.ok(failComment, 'Expected ❌ implement failure comment');
    assert.ok(failComment.body.includes('github.com') && failComment.body.includes('/pull/'),
      'Failure comment should include draft PR URL');

    cleanup(); repoCleanup();
  });

  test('does not create PR on non-implement stage failure', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();
    // specify is stage index 0 — fail immediately
    const spawnFn = makeSpawnFnFailAt(0);
    const gitFn = makeGitFn('feature/test-feature');

    await executeJob(db, job, octokit, config, { spawnFn, gitFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed');
    assert.equal(octokit.prs.length, 0, 'Should not create PR when non-implement stage fails');

    cleanup(); repoCleanup();
  });
});

describe('executeJob — draft PR guarantee on implement success without PR', () => {
  test('creates draft PR when all stages succeed but no PR URL detected in output', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();
    // All stages succeed, none emit a PR URL
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);
    const gitFn = makeGitFn('feature/test-feature');

    await executeJob(db, job, octokit, config, { spawnFn, gitFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');

    // A fallback draft PR should have been created
    assert.equal(octokit.prs.length, 1, 'Expected one draft PR to be created as fallback');

    // A 🎉 PR opened comment should appear
    assert.ok(octokit.comments.some(c => c.body.includes('🎉') && c.body.includes('github.com')),
      'Expected 🎉 PR opened comment with URL');

    cleanup(); repoCleanup();
  });

  test('skips draft PR creation when implement already opened a PR', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();
    // implement emits a PR URL — no fallback should be triggered.
    // analyze fires twice (stage + remediation), so implement is call index 6.
    const spawnFn = makeSpawnFn([
      [],
      ['no clarification needed'],
      [], [], [],
      [], // analyze remediation
      ['PR created: https://github.com/owner/repo/pull/42'],
    ]);
    const gitFn = makeGitFn('feature/test-feature');

    await executeJob(db, job, octokit, config, { spawnFn, gitFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');

    // pulls.create should NOT have been called
    assert.equal(octokit.prs.length, 0, 'Should not create a second PR when one was already detected');

    cleanup(); repoCleanup();
  });
});

// ── T010: output attached to error ────────────────────────────────────────

describe('runClaudeStage — err.output on non-zero exit', () => {
  test('err.output contains accumulated stdout text when process exits non-zero', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 500 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // spawnFn emits rate-limit text then exits 1
    const spawnFn = () => makeChildProcess(['usage limit reached'], 1);

    await executeJob(db, job, octokit, config, { spawnFn });

    // Job should be failed or rate_limited; either way err.output was accessible
    const updated = getJob(db, job.id);
    assert.ok(
      updated.status === 'failed' || updated.status === 'rate_limited',
      `Expected failed or rate_limited, got ${updated.status}`
    );
    cleanup(); repoCleanup();
  });
});

// ── T011: rate-limit detection in executeJob (US1) ─────────────────────────

describe('executeJob — rate limit on specify stage', () => {
  test('sets status to rate_limited and posts comment when rate-limit message detected', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 510 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // specify exits non-zero with a rate-limit message containing an ISO timestamp
    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const spawnFn = () => makeChildProcess(
      [`Claude AI usage limit reached. Resets at ${futureIso}`], 1
    );

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'rate_limited');
    assert.ok(updated.rate_limit_reset_at, 'rate_limit_reset_at should be set');
    assert.equal(updated.rate_limit_count, 1);

    // Comment should mention the rate limit
    const rlComment = octokit.comments.find(c =>
      c.body.toLowerCase().includes('rate limit') ||
      c.body.toLowerCase().includes('usage limit')
    );
    assert.ok(rlComment, 'Expected a rate-limit comment to be posted');

    cleanup(); repoCleanup();
  });

  test('rate-limit comment body contains stage name and reset time', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 511 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const futureIso = new Date(Date.now() + 47 * 60 * 1000).toISOString();
    const spawnFn = () => makeChildProcess(
      [`usage limit reached reset at ${futureIso}`], 1
    );

    await executeJob(db, job, octokit, config, { spawnFn });

    const rlComment = octokit.comments.find(c =>
      c.body.toLowerCase().includes('rate limit') ||
      c.body.toLowerCase().includes('usage limit')
    );
    assert.ok(rlComment, 'Rate-limit comment not found');
    // Comment body should include stage info
    assert.ok(
      rlComment.body.toLowerCase().includes('specify') ||
      rlComment.body.includes('🔍') ||
      rlComment.body.toLowerCase().includes('stage'),
      `Comment should mention stage: ${rlComment.body}`
    );

    cleanup(); repoCleanup();
  });

  test('comment body contains fallback phrase when no timestamp in output', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 512 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // Rate-limit message with no parseable timestamp
    const spawnFn = () => makeChildProcess(['Claude AI usage limit reached'], 1);

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'rate_limited');

    const rlComment = octokit.comments.find(c =>
      c.body.toLowerCase().includes('rate limit') ||
      c.body.toLowerCase().includes('fallback') ||
      c.body.toLowerCase().includes('unknown')
    );
    assert.ok(rlComment, 'Expected rate-limit fallback comment');
    // Should mention fallback duration
    assert.ok(
      rlComment.body.includes('60') || rlComment.body.toLowerCase().includes('fallback'),
      `Comment should mention fallback wait: ${rlComment.body}`
    );

    cleanup(); repoCleanup();
  });

  test('job.stage is preserved (not reset) after markRateLimited', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 513 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const spawnFn = () => makeChildProcess(
      [`usage limit reached ${futureIso}`], 1
    );

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'rate_limited');
    // Stage should be 'specify' (the stage that was running), not 'idle' or 'done'
    assert.equal(updated.stage, 'specify',
      `Stage should be preserved as 'specify', got '${updated.stage}'`
    );

    cleanup(); repoCleanup();
  });

  test('non-rate-limit error still calls markFailed (not markRateLimited)', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 514 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // Generic failure — no rate-limit phrase
    const spawnFn = () => makeChildProcess(['Error: command not found'], 1);

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed', 'Non-rate-limit error should set status to failed');
    assert.equal(updated.rate_limit_count, 0, 'rate_limit_count should remain 0');

    cleanup(); repoCleanup();
  });
});

// ── T017: retry cap tests (US3) ────────────────────────────────────────────

describe('executeJob — rate-limit retry cap at 3', () => {
  test('4th rate-limit occurrence permanently fails the job', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    // Seed the job with rate_limit_count already at 3 (simulates 3 prior retries)
    const job = makeJob(repoPath, { issue_number: 530, rate_limit_count: 3 });
    enqueueJob(db, job);
    // Manually set rate_limit_count in DB to 3
    const { markRateLimited: mrl } = await import('../../src/db/jobs.js');
    mrl(db, job.id, null, 3);
    // Re-fetch so job object has rate_limit_count=3
    const { getJob: gj } = await import('../../src/db/jobs.js');
    const freshJob = gj(db, job.id);

    const octokit = makeOctokit();
    const config = makeConfig();
    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const spawnFn = () => makeChildProcess(
      [`usage limit reached ${futureIso}`], 1
    );

    await executeJob(db, freshJob, octokit, config, { spawnFn });

    const updated = gj(db, freshJob.id);
    assert.equal(updated.status, 'failed',
      `Expected 'failed' on 4th rate limit, got '${updated.status}'`
    );

    // A terminal error comment should have been posted
    const terminalComment = octokit.comments.find(c =>
      c.body.includes('❌') ||
      c.body.toLowerCase().includes('retry limit') ||
      c.body.toLowerCase().includes('3/3')
    );
    assert.ok(terminalComment, 'Expected a terminal failure comment for retry limit');

    cleanup(); repoCleanup();
  });

  test('3rd rate-limit occurrence (count=2→3) still sets rate_limited', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();

    const job = makeJob(repoPath, { issue_number: 531 });
    enqueueJob(db, job);
    // Manually set count to 2 to simulate 2 prior rate limits
    const { markRateLimited: mrl, getJob: gj } = await import('../../src/db/jobs.js');
    mrl(db, job.id, null, 2);
    const freshJob = gj(db, job.id);

    const octokit = makeOctokit();
    const config = makeConfig();
    const spawnFn = () => makeChildProcess(['usage limit reached'], 1);

    await executeJob(db, freshJob, octokit, config, { spawnFn });

    const updated = gj(db, freshJob.id);
    assert.equal(updated.status, 'rate_limited',
      `3rd hit should still be rate_limited, got '${updated.status}'`
    );
    assert.equal(updated.rate_limit_count, 3);

    cleanup(); repoCleanup();
  });
});
