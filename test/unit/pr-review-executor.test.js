import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { makeJobId } from '../../src/db/jobs.js';
import { enqueuePrReview, dequeuePrReview } from '../../src/db/pr-reviews.js';
import { executePrReview } from '../../src/daemon/pr-review-executor.js';
import { RateLimitError } from '../../src/github/client.js';

// ---------- helpers ----------

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-pr-executor-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeReview(db, overrides = {}) {
  const review = {
    id: makeJobId(),
    github_repo: 'owner/repo',
    pr_number: 42,
    issue_number: 1,
    repo_path: '/repos/test',
    comment_id: '101',
    comment_body: 'Please add error handling',
    pr_url: 'https://github.com/owner/repo/pull/42',
    status: 'queued',
    created_at: new Date().toISOString(),
    ...overrides,
  };
  enqueuePrReview(db, review);
  return dequeuePrReview(db); // returns active row
}

function makeOctokit() {
  const comments = [];
  return {
    _comments: comments,
    issues: {
      createComment: async ({ body }) => {
        comments.push(body);
        return { data: { id: comments.length } };
      },
    },
  };
}

function makeConfig() {
  return {
    githubToken: 'ghp_test',
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
  };
}

// Mock child process that emits lines then closes with given exit code
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

// spawnFn that returns one process for Claude, then a second for git
function makeSpawnFn(claudeExitCode = 0, claudeLines = []) {
  return (_bin, _args, _opts) => makeChildProcess(claudeLines, claudeExitCode);
}

// execFileFn that resolves immediately (successful git push)
function makeExecFileFn(exitCode = 0) {
  return (_bin, _args, _opts, cb) => {
    if (exitCode === 0) {
      cb(null, { stdout: '', stderr: '' });
    } else {
      const err = new Error('git push failed');
      err.code = exitCode;
      cb(err);
    }
  };
}

// ---------- tests ----------

describe('executePrReview — acknowledgement posted before Claude runs', () => {
  test('👀 acknowledgement comment is first comment on PR', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0),
      execFileFn: makeExecFileFn(0),
    });

    assert.ok(octokit._comments.length >= 1, 'at least one comment should be posted');
    assert.ok(octokit._comments[0].startsWith('👀'),
      `first comment should be acknowledgement, got: ${octokit._comments[0]}`);

    cleanup();
  });
});

describe('executePrReview — successful flow', () => {
  test('on Claude exit 0: push runs and success comment posted', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    const octokit = makeOctokit();
    let pushCalled = false;

    const execFileFn = (_bin, _args, _opts, cb) => {
      pushCalled = true;
      cb(null, { stdout: '', stderr: '' });
    };

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0),
      execFileFn,
    });

    assert.ok(pushCalled, 'git push should be called on success');
    const successComment = octokit._comments.find(c => c.startsWith('✅'));
    assert.ok(successComment, 'success comment should be posted');

    // Job should be marked complete
    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(review.id);
    assert.equal(job.status, 'completed');

    cleanup();
  });
});

describe('executePrReview — failure flow', () => {
  test('on Claude exit non-zero: failure comment posted and status reset to queued', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(1), // Claude exits with error
      execFileFn: makeExecFileFn(0),
    });

    const failureComment = octokit._comments.find(c => c.startsWith('❌'));
    assert.ok(failureComment, 'failure comment should be posted');
    assert.ok(failureComment.includes('retry'), 'failure comment should mention retry');

    // Job should be reset to queued for retry
    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(review.id);
    assert.equal(job.status, 'queued', 'failed job should be reset to queued for retry');

    cleanup();
  });

  test('on git push failure: failure comment posted and status reset to queued', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0), // Claude succeeds
      execFileFn: makeExecFileFn(1), // push fails
    });

    const failureComment = octokit._comments.find(c => c.startsWith('❌'));
    assert.ok(failureComment, 'failure comment should be posted on push failure');

    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(review.id);
    assert.equal(job.status, 'queued');

    cleanup();
  });
});

describe('executePrReview — rate limit handling', () => {
  test('RateLimitError: status reset to queued, no failure comment, error re-thrown', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    const commentsPosted = [];

    const rateLimitOctokit = {
      issues: {
        createComment: async ({ body }) => {
          commentsPosted.push(body);
          // Throw rate limit on the acknowledgement post
          throw new RateLimitError(60000);
        },
      },
    };

    await assert.rejects(
      () => executePrReview(db, review, rateLimitOctokit, makeConfig(), {
        spawnFn: makeSpawnFn(0),
        execFileFn: makeExecFileFn(0),
      }),
      (err) => {
        assert.ok(err instanceof RateLimitError, 'should re-throw RateLimitError');
        return true;
      }
    );

    // No failure comment should be posted (rate limit is transient)
    const failureComment = commentsPosted.find(c => c.startsWith('❌'));
    assert.ok(!failureComment, 'no failure comment should be posted on rate limit');

    // Job should be reset to queued
    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(review.id);
    assert.equal(job.status, 'queued');

    cleanup();
  });
});

describe('executePrReview — batch acknowledgement message (US2)', () => {
  test('comment_body with 3 sections → ack says "Received 3 comment(s)"', async () => {
    const { db, cleanup } = makeTempDb();
    const batchBody = 'Fix error handling\n\n---\n\nAdd logging\n\n---\n\nUpdate README';
    const review = makeReview(db, { comment_body: batchBody });
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0),
      execFileFn: makeExecFileFn(0),
    });

    assert.ok(octokit._comments[0].includes('3 comment(s)'),
      `ack should say "3 comment(s)", got: ${octokit._comments[0]}`);

    cleanup();
  });

  test('single comment_body → ack says "Received 1 comment(s)"', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db, { comment_body: 'Just one thing to fix' });
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0),
      execFileFn: makeExecFileFn(0),
    });

    assert.ok(octokit._comments[0].includes('1 comment(s)'),
      `ack should say "1 comment(s)", got: ${octokit._comments[0]}`);

    cleanup();
  });
});
