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

// ---------- T004: startup command tests (must FAIL before T005/T006 implementation) ----------

describe('executeJob — startup command (US1)', () => {
  test('runs startupCommand when repoConfig.startupCommand is set', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'echo startup-ran' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    // Startup command ran — should see a comment about it
    assert.ok(octokit.comments.some(c =>
      c.body.toLowerCase().includes('startup') && c.body.includes('✅')
    ), 'Expected startup success comment');
    cleanup(); repoCleanup();
  });

  test('skips startupCommand when absent (backward compat)', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath }], // no startupCommand
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(!octokit.comments.some(c => c.body.toLowerCase().includes('startup')),
      'Unexpected startup comment when startupCommand not set');
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');
    cleanup(); repoCleanup();
  });

  test('skips startupCommand when set to empty string', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: '' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(!octokit.comments.some(c => c.body.toLowerCase().includes('startup')),
      'Unexpected startup comment when startupCommand is empty string');
    cleanup(); repoCleanup();
  });

  test('runs startupCommand in job.repo_path as cwd', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    // Write a sentinel file — startup command echoes it only if cwd is correct
    const sentinelFile = path.join(repoPath, 'cwd-check.txt');
    fs.writeFileSync(sentinelFile, 'ok');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'cat cwd-check.txt' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    // If cwd was correct, `cat cwd-check.txt` exits 0 → startup success comment
    assert.ok(octokit.comments.some(c => c.body.includes('✅') && c.body.toLowerCase().includes('startup')));
    cleanup(); repoCleanup();
  });

  test('startup command runs after global postImplementCommand', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const order = [];
    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = {
      comments: [],
      issues: {
        createComment: async ({ body }) => {
          octokit.comments.push({ body });
          if (body.toLowerCase().includes('post-implement hook')) order.push('postImplementCommand');
          if (body.toLowerCase().includes('startup')) order.push('startup');
          return { data: { id: octokit.comments.length } };
        },
        listComments: async () => ({ data: [] }),
      },
    };
    const config = makeConfig('ghp_test', {
      postImplementCommand: 'echo global-hook',
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'echo startup' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(order.includes('postImplementCommand'), 'postImplementCommand should fire');
    assert.ok(order.includes('startup'), 'startupCommand should fire');
    assert.ok(order.indexOf('postImplementCommand') < order.indexOf('startup'),
      'postImplementCommand should fire before startupCommand');
    cleanup(); repoCleanup();
  });
});

// ---------- T008: startup command reporting tests (must FAIL before T009) ----------

describe('executeJob — startup command reporting (US2)', () => {
  test('posts success comment with elapsed time on exit 0', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'echo hello' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    const startupComment = octokit.comments.find(c =>
      c.body.includes('✅') && c.body.toLowerCase().includes('startup')
    );
    assert.ok(startupComment, 'Expected ✅ startup comment');
    assert.ok(startupComment.body.includes('s)') || startupComment.body.match(/\d+s/),
      'Comment should include elapsed time');
    cleanup(); repoCleanup();
  });

  test('posts failure comment on non-zero exit — job stays completed', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'exit 1' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    assert.ok(octokit.comments.some(c =>
      c.body.includes('⚠️') && c.body.toLowerCase().includes('startup')
    ), 'Expected ⚠️ startup failure comment');

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed', 'Job should remain completed even when startup fails');
    cleanup(); repoCleanup();
  });

  test('failure comment does not call markFailed', async () => {
    const { db, cleanup } = makeTempDb();
    const { dir: repoPath, cleanup: repoCleanup } = makeTempRepo();
    writeArtifacts(repoPath, 'spec.md', 'plan.md', 'tasks.md');

    const job = makeJob(repoPath);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig('ghp_test', {
      repos: [{ repo: 'owner/repo', localPath: repoPath, startupCommand: 'exit 99' }],
    });
    const spawnFn = makeSpawnFn([[], ['no clarification needed'], [], [], [], []]);

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');
    assert.equal(updated.error, null);
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
