import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, makeJobId, getJob, listRecent } from '../../src/db/jobs.js';
import { executeJob } from '../../src/daemon/stage-executor.js';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-integration-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: Math.floor(Math.random() * 10000) + 1000,
    issue_title: '[COCKPIT] integration test feature',
    issue_body: 'integration test',
    spec_name: 'integration test feature',
    repo_path: '/repos/test',
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

function makeConfig() {
  return {
    githubToken: 'ghp_integrationtest',
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos: [{ repo: 'owner/repo', localPath: '/repos/test' }],
  };
}

// Mock PTY factory
function makeMockSpawn(sentinelLines, exitCode = 0, delayMs = 0) {
  return (_repoPath, _configDir, _args, _opts) => {
    let dataHandler = null;
    let exitHandler = null;
    return {
      onData: (cb) => { dataHandler = cb; },
      onExit: (cb) => {
        exitHandler = cb;
        const emit = () => {
          for (const line of sentinelLines) {
            if (dataHandler) dataHandler(line + '\n');
          }
          if (exitHandler) exitHandler(exitCode);
        };
        if (delayMs > 0) setTimeout(emit, delayMs);
        else setImmediate(emit);
      },
      write: () => {},
      kill: () => {},
    };
  };
}

describe('Full job lifecycle — happy path', () => {
  let db, cleanup;

  before(() => {
    ({ db, cleanup } = makeTempDb());
  });

  after(() => cleanup());

  test('queued→active→completed with 7+ comments', async () => {
    const job = makeJob();
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const sentinels = [
      'spec.md written',
      'no clarification needed',
      'plan.md written',
      'tasks.md written',
      'analysis complete',
      'pr created successfully',
    ];

    await executeJob(db, job, octokit, config, {
      spawnOverride: makeMockSpawn(sentinels, 0),
    });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');

    // picked-up (1) + 6 stage sentinels = 7 minimum
    assert.ok(octokit.comments.length >= 7,
      `Expected >=7 comments, got ${octokit.comments.length}`);

    // First comment is the "picked up" message
    assert.ok(
      octokit.comments[0].body.includes('picked up') ||
      octokit.comments[0].body.includes('Cockpit'),
      'First comment should be pick-up acknowledgement'
    );
  });
});

describe('Full job lifecycle — failure path', () => {
  let db, cleanup;

  before(() => {
    ({ db, cleanup } = makeTempDb());
  });

  after(() => cleanup());

  test('failed job posts error comment and next queued job starts', async () => {
    const job1 = makeJob({ issue_number: 2001 });
    const job2 = makeJob({ issue_number: 2002 });
    enqueueJob(db, job1);
    enqueueJob(db, job2);

    const octokit = makeOctokit();
    const config = makeConfig();

    // Execute job1 — exits with code 1 (failure)
    await executeJob(db, job1, octokit, config, {
      spawnOverride: makeMockSpawn([], 1),
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
    const sentinels = ['spec.md written', 'no clarification needed', 'plan.md written',
                       'tasks.md written', 'analysis complete', 'pr created successfully'];
    await executeJob(db, job2, octokit, config, {
      spawnOverride: makeMockSpawn(sentinels, 0),
    });

    const updated2b = getJob(db, job2.id);
    assert.equal(updated2b.status, 'completed');
  });
});
