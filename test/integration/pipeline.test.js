import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, makeJobId, getJob } from '../../src/db/jobs.js';
import { executeJob } from '../../src/daemon/stage-executor.js';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-integration-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-integration-repo-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function writeArtifacts(repoPath, ...filenames) {
  for (const f of filenames) fs.writeFileSync(path.join(repoPath, f), `# ${f}\n`);
}

function makeJob(repoPath, overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: Math.floor(Math.random() * 10000) + 1000,
    issue_title: '[COCKPIT] integration test feature',
    issue_body: 'integration test',
    spec_name: 'integration test feature',
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
  return {
    comments,
    issues: {
      createComment: async ({ owner, repo, issue_number, body }) => {
        comments.push({ issue_number, body });
        return { data: { id: comments.length } };
      },
      listComments: async () => ({ data: [] }),
    },
  };
}

function makeConfig(repoPath) {
  return {
    githubToken: 'ghp_integrationtest',
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos: [{ repo: 'owner/repo', localPath: repoPath }],
  };
}

// Mock spawn factory — returns a child-process-style EventEmitter
function makeMockSpawn(lines = [], exitCode = 0) {
  return () => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    setImmediate(() => {
      for (const line of lines) proc.stdout.emit('data', Buffer.from(line + '\n'));
      proc.emit('close', exitCode);
    });
    return proc;
  };
}

describe('Full job lifecycle — happy path', () => {
  let db, dbCleanup, repoDir, repoCleanup;

  before(() => {
    ({ db, cleanup: dbCleanup } = makeTempDb());
    ({ dir: repoDir, cleanup: repoCleanup } = makeTempRepo());
    writeArtifacts(repoDir, 'spec.md', 'plan.md', 'tasks.md');
  });

  after(() => { dbCleanup(); repoCleanup(); });

  test('queued→active→completed with 7+ comments', async () => {
    const job = makeJob(repoDir);
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig(repoDir);

    const spawnFn = makeMockSpawn(['no clarification needed'], 0);

    await executeJob(db, job, octokit, config, { spawnFn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');

    // picked-up (1) + 6 stage-complete comments = 7 minimum
    assert.ok(octokit.comments.length >= 7,
      `Expected >=7 comments, got ${octokit.comments.length}`);

    assert.ok(
      octokit.comments[0].body.includes('picked up') ||
      octokit.comments[0].body.includes('Cockpit'),
      'First comment should be pick-up acknowledgement'
    );
  });
});

describe('Full job lifecycle — failure path', () => {
  let db, dbCleanup, repoDir, repoCleanup;

  before(() => {
    ({ db, cleanup: dbCleanup } = makeTempDb());
    ({ dir: repoDir, cleanup: repoCleanup } = makeTempRepo());
    writeArtifacts(repoDir, 'spec.md', 'plan.md', 'tasks.md');
  });

  after(() => { dbCleanup(); repoCleanup(); });

  test('failed job posts error comment and next queued job starts', async () => {
    const job1 = makeJob(repoDir, { issue_number: 2001 });
    const job2 = makeJob(repoDir, { issue_number: 2002 });
    enqueueJob(db, job1);
    enqueueJob(db, job2);

    const octokit = makeOctokit();
    const config = makeConfig(repoDir);

    // Execute job1 — exits with code 1 (failure on first stage)
    await executeJob(db, job1, octokit, config, {
      spawnFn: makeMockSpawn([], 1),
    });

    const updated1 = getJob(db, job1.id);
    assert.equal(updated1.status, 'failed');
    assert.ok(
      octokit.comments.some(c => c.body.includes('failed') || c.body.includes('❌')),
      'Error comment should be posted'
    );

    // job2 should still be queued (not affected)
    const updated2 = getJob(db, job2.id);
    assert.equal(updated2.status, 'queued',
      'Second job should still be queued after first fails');

    // Now execute job2 — succeeds
    await executeJob(db, job2, octokit, config, {
      spawnFn: makeMockSpawn(['no clarification needed'], 0),
    });

    const updated2b = getJob(db, job2.id);
    assert.equal(updated2b.status, 'completed');
  });
});
