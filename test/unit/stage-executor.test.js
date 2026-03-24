import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, makeJobId, getJob } from '../../src/db/jobs.js';
import { getLogTail } from '../../src/db/logs.js';
import { executeJob } from '../../src/daemon/stage-executor.js';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-stage-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: 42,
    issue_title: '[COCKPIT] test feature',
    issue_body: 'test',
    spec_name: 'test feature',
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
        comments.push({ owner, repo, issue_number, body });
        return { data: { id: comments.length } };
      },
      listComments: async () => ({ data: [] }),
    },
  };
}

function makeConfig(token = 'ghp_testtoken123') {
  return {
    githubToken: token,
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos: [{ repo: 'owner/repo', localPath: '/repos/test' }],
  };
}

describe('executeJob — happy path (6 sentinels)', () => {
  test('posts picked-up comment and stage comments', async () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob();
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    // Mock process that emits all 6 sentinels then exits 0
    const mockSpawn = (_repoPath, _configDir, _args, _opts) => {
      let dataHandler = null;
      let exitHandler = null;
      const pty = {
        onData: (cb) => { dataHandler = cb; },
        onExit: (cb) => { exitHandler = cb; },
        write: () => {},
        kill: () => {},
      };
      setImmediate(() => {
        const sentinels = [
          'spec.md written',
          'no clarification needed',
          'plan.md written',
          'tasks.md written',
          'analysis complete',
          'pr created successfully',
        ];
        for (const line of sentinels) {
          if (dataHandler) dataHandler(line + '\n');
        }
        if (exitHandler) exitHandler(0);
      });
      return pty;
    };

    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    // Should have: 1 picked-up + 6 stage comments = 7+
    assert.ok(octokit.comments.length >= 7, `Expected >=7 comments, got ${octokit.comments.length}`);
    assert.ok(octokit.comments[0].body.toLowerCase().includes('picked up') ||
              octokit.comments[0].body.toLowerCase().includes('working on'));
    cleanup();
  });
});

describe('executeJob — failure path', () => {
  test('marks job failed and posts error comment on non-zero exit', async () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob({ issue_number: 99 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig();

    const mockSpawn = () => {
      let exitHandler = null;
      return {
        onData: () => {},
        onExit: (cb) => { exitHandler = cb; setImmediate(() => exitHandler && exitHandler(1)); },
        write: () => {},
        kill: () => {},
      };
    };

    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed');
    assert.ok(octokit.comments.some(c => c.body.toLowerCase().includes('fail') ||
                                         c.body.toLowerCase().includes('error')));
    cleanup();
  });
});

describe('executeJob — token redaction', () => {
  test('GitHub token is redacted in job logs', async () => {
    const { db, cleanup } = makeTempDb();
    const token = 'ghp_supersecrettoken999';
    const job = makeJob({ issue_number: 77 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = makeConfig(token);

    const mockSpawn = () => {
      let dataHandler = null;
      let exitHandler = null;
      return {
        onData: (cb) => { dataHandler = cb; },
        onExit: (cb) => {
          exitHandler = cb;
          setImmediate(() => {
            // Emit a line containing the token
            if (dataHandler) dataHandler(`Using token ${token} for auth\n`);
            if (exitHandler) exitHandler(0);
          });
        },
        write: () => {},
        kill: () => {},
      };
    };

    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    const logs = getLogTail(db, job.id, 100);
    for (const line of logs) {
      assert.ok(!line.includes(token), `Token found unredacted in: "${line}"`);
    }
    assert.ok(logs.some(l => l.includes('[REDACTED]')));
    cleanup();
  });
});

// T053: post-implement hook tests
describe('executeJob — post-implement hook', () => {
  test('fires when postImplementCommand is set after implement sentinel', async () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob({ issue_number: 300 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = { ...makeConfig(), postImplementCommand: 'echo "hook ran"' };

    const mockSpawn = () => {
      let dataHandler = null;
      let exitHandler = null;
      return {
        onData: (cb) => { dataHandler = cb; },
        onExit: (cb) => {
          exitHandler = cb;
          setImmediate(() => {
            if (dataHandler) dataHandler('pr created successfully\n');
            if (exitHandler) exitHandler(0);
          });
        },
        write: () => {},
        kill: () => {},
      };
    };

    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    // Should have a ✅ hook comment
    assert.ok(octokit.comments.some(c => c.body.includes('✅') && c.body.toLowerCase().includes('hook')));
    cleanup();
  });

  test('skipped when postImplementCommand is empty', async () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob({ issue_number: 301 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    const config = { ...makeConfig(), postImplementCommand: '' };

    const mockSpawn = () => {
      let dataHandler = null;
      let exitHandler = null;
      return {
        onData: (cb) => { dataHandler = cb; },
        onExit: (cb) => {
          exitHandler = cb;
          setImmediate(() => {
            if (dataHandler) dataHandler('pr created successfully\n');
            if (exitHandler) exitHandler(0);
          });
        },
        write: () => {},
        kill: () => {},
      };
    };

    const commentCountBefore = 0;
    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    // No hook comment when command is empty
    assert.ok(!octokit.comments.some(c =>
      c.body.toLowerCase().includes('post-implement hook') ||
      (c.body.includes('✅') && c.body.toLowerCase().includes('hook'))
    ));
    cleanup();
  });

  test('job remains completed even if hook fails', async () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob({ issue_number: 302 });
    enqueueJob(db, job);
    const octokit = makeOctokit();
    // A command that will exit non-zero
    const config = { ...makeConfig(), postImplementCommand: 'exit 42' };

    const mockSpawn = () => {
      let dataHandler = null;
      let exitHandler = null;
      return {
        onData: (cb) => { dataHandler = cb; },
        onExit: (cb) => {
          exitHandler = cb;
          setImmediate(() => {
            if (dataHandler) dataHandler('pr created successfully\n');
            if (exitHandler) exitHandler(0);
          });
        },
        write: () => {},
        kill: () => {},
      };
    };

    await executeJob(db, job, octokit, config, { spawnOverride: mockSpawn });

    // Job should still be completed
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'completed');
    // Should have a ⚠️ warning comment
    assert.ok(octokit.comments.some(c => c.body.includes('⚠️')));
    cleanup();
  });
});
