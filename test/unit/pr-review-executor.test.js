import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { makeJobId } from '../../src/db/jobs.js';
import { enqueuePrReview, dequeuePrReview } from '../../src/db/pr-reviews.js';
import { executePrReview, extractChangesSection, buildSuccessComment } from '../../src/daemon/pr-review-executor.js';
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

// T003 — extractChangesSection unit tests
describe('extractChangesSection', () => {
  test('section present mid-output — returns content between ## Changes Made and next heading', () => {
    const output = 'Some work done.\n\n## Changes Made\n- Fixed error handling\n- Added validation\n\n## Other Section\nmore text';
    const result = extractChangesSection(output);
    assert.ok(result.includes('- Fixed error handling'), `expected change bullets, got: ${result}`);
    assert.ok(result.includes('- Added validation'), `expected second bullet, got: ${result}`);
    assert.ok(!result.includes('## Other Section'), 'should not bleed into next heading');
  });

  test('section absent — returns empty string', () => {
    const output = 'Implementation done. No structured section here.';
    assert.equal(extractChangesSection(output), '');
  });

  test('section at end of string with no trailing heading — returns content through EOF', () => {
    const output = 'Work complete.\n\n## Changes Made\n- Removed duplicate check\n- Refactored loop';
    const result = extractChangesSection(output);
    assert.ok(result.includes('- Removed duplicate check'), `expected bullet, got: ${result}`);
    assert.ok(result.includes('- Refactored loop'), `expected second bullet, got: ${result}`);
  });

  test('empty/null input — returns empty string', () => {
    assert.equal(extractChangesSection(''), '');
    assert.equal(extractChangesSection(null), '');
  });
});

// T004 — buildSuccessComment unit tests
describe('buildSuccessComment', () => {
  test('non-empty changesSection — output contains both labeled sections and content', () => {
    const commentBody = 'Please add error handling to the login function.';
    const changesSection = '- Added try/catch around login logic\n- Returns 400 on invalid input';
    const result = buildSuccessComment(commentBody, changesSection);

    assert.ok(result.includes('### What was addressed'), 'should contain What was addressed heading');
    assert.ok(result.includes('### What was changed'), 'should contain What was changed heading');
    assert.ok(result.includes('> Please add error handling'), 'should blockquote the original comment');
    assert.ok(result.includes('- Added try/catch'), 'should include changes content');
    assert.ok(result.startsWith('✅'), 'should start with success emoji');
  });

  test('empty changesSection — fallback message present, What was addressed still shown', () => {
    const commentBody = 'Fix the typo in README.';
    const result = buildSuccessComment(commentBody, '');

    assert.ok(result.includes('### What was addressed'), 'should still show What was addressed');
    assert.ok(result.includes('> Fix the typo'), 'should blockquote the original comment');
    assert.ok(result.includes('*No changes summary was generated.*'), 'should show fallback message');
    assert.ok(!result.includes('### What was changed'), 'should not show What was changed heading with no content');
  });
});

// T011 — length guard
describe('buildSuccessComment — length guard', () => {
  test('output is capped at 8000 chars and contains truncation marker when changesSection is very long', () => {
    const commentBody = 'Please fix the thing.';
    const changesSection = 'x'.repeat(9000);
    const result = buildSuccessComment(commentBody, changesSection);

    assert.ok(result.length <= 8000, `output should be ≤ 8000 chars, got ${result.length}`);
    assert.ok(result.includes('… (truncated)'), 'should include truncation marker');
  });
});

// T012 — fallback integration: Claude output has no ## Changes Made section
describe('executePrReview — fallback: no Changes Made section', () => {
  test('posts fallback comment and completes job when Claude output has no Changes Made section', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db, { comment_body: 'Fix the button alignment' });
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0, ['Implementation complete. No structured section here.']),
      execFileFn: makeExecFileFn(0),
    });

    const successComment = octokit._comments.find(c => c.startsWith('✅'));
    assert.ok(successComment, 'success comment should still be posted');
    assert.ok(successComment.includes('Fix the button alignment'), 'should include original comment text');
    assert.ok(successComment.includes('*No changes summary was generated.*'), 'should show fallback message');

    const job = db.prepare('SELECT * FROM pr_review_jobs WHERE id = ?').get(review.id);
    assert.equal(job.status, 'completed', 'job should still be marked completed');

    cleanup();
  });
});

// T008 — buildSuccessComment with multi-comment batch
describe('buildSuccessComment — multi-comment batch (US2)', () => {
  test('all original comment sections appear in What was addressed', () => {
    const commentBody = 'Fix error handling\n\n---\n\nAdd logging\n\n---\n\nUpdate README';
    const changesSection = '- Fixed error handling in main handler\n- Added logging middleware\n- Updated README with new instructions';
    const result = buildSuccessComment(commentBody, changesSection);

    assert.ok(result.includes('Fix error handling'), 'should include first comment');
    assert.ok(result.includes('Add logging'), 'should include second comment');
    assert.ok(result.includes('Update README'), 'should include third comment');
    assert.ok(result.includes('### What was addressed'), 'should have addressed section');
    assert.ok(result.includes('### What was changed'), 'should have changed section');
    assert.ok(result.includes('- Fixed error handling in main handler'), 'should include first change bullet');
    assert.ok(result.includes('- Added logging middleware'), 'should include second change bullet');
  });
});

// T009 — executePrReview multi-comment batch integration test
describe('executePrReview — multi-comment success (US2)', () => {
  test('success comment references all batched comments and change bullets', async () => {
    const { db, cleanup } = makeTempDb();
    const batchBody = 'Fix error handling\n\n---\n\nAdd logging';
    const review = makeReview(db, { comment_body: batchBody });
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0, [
        'Working on the requested changes.',
        '## Changes Made',
        '- Fixed error handling in the request pipeline',
        '- Added logging to capture request details',
      ]),
      execFileFn: makeExecFileFn(0),
    });

    const successComment = octokit._comments.find(c => c.startsWith('✅'));
    assert.ok(successComment, 'success comment should be posted');
    assert.ok(successComment.includes('Fix error handling'), 'should reference first comment');
    assert.ok(successComment.includes('Add logging'), 'should reference second comment');
    assert.ok(successComment.includes('- Fixed error handling in the request pipeline'), 'should include first change bullet');
    assert.ok(successComment.includes('- Added logging to capture request details'), 'should include second change bullet');

    cleanup();
  });
});

// success comment failure → reset to queued, not marked complete
describe('executePrReview — success comment post failure resets to queued', () => {
  test('if postPRComment for success comment throws, job is reset to queued not completed', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db);
    let callCount = 0;

    const failingOctokit = {
      issues: {
        createComment: async ({ body }) => {
          callCount++;
          // First call is the acknowledgement — let it succeed
          if (callCount === 1) return { data: { id: 1 } };
          // Second call is the success/response comment — fail it
          throw new Error('GitHub API error');
        },
      },
    };

    await executePrReview(db, review, failingOctokit, makeConfig(), {
      spawnFn: makeSpawnFn(0),
      execFileFn: makeExecFileFn(0),
    });

    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(review.id);
    assert.equal(job.status, 'queued', 'job should be reset to queued when success comment fails');

    cleanup();
  });
});

// runNextPrReview — unexpected exception resets job to queued
describe('runNextPrReview — unexpected exception resets job to queued', () => {
  test('if executePrReview throws unexpectedly, job is reset to queued not left active', async () => {
    const { db, cleanup } = makeTempDb();
    const { runNextPrReview } = await import('../../src/daemon/job-runner.js');

    const review = makeReview(db);
    // review is now active (dequeuePrReview was called inside makeReview)
    // We need a fresh queued job to test runNextPrReview
    const { enqueuePrReview } = await import('../../src/db/pr-reviews.js');
    const { makeJobId } = await import('../../src/db/jobs.js');
    const freshReview = {
      id: makeJobId(),
      github_repo: 'owner/repo',
      pr_number: 42,
      issue_number: 1,
      repo_path: '/repos/test',
      comment_id: '999',
      comment_body: 'Fix this',
      pr_url: 'https://github.com/owner/repo/pull/42',
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    enqueuePrReview(db, freshReview);

    // Octokit that throws on createComment to simulate unexpected crash
    const crashOctokit = {
      issues: {
        createComment: async () => { throw new Error('unexpected crash'); },
      },
    };

    await runNextPrReview(db, crashOctokit, makeConfig());

    const job = db.prepare("SELECT * FROM pr_review_jobs WHERE id = ?").get(freshReview.id);
    assert.equal(job.status, 'queued', 'job should be reset to queued after unexpected exception');

    cleanup();
  });
});

// T005 — updated executePrReview successful flow integration test
describe('executePrReview — enriched success comment (US1)', () => {
  test('success comment contains What was addressed and What was changed sections', async () => {
    const { db, cleanup } = makeTempDb();
    const review = makeReview(db, { comment_body: 'Please add error handling' });
    const octokit = makeOctokit();

    await executePrReview(db, review, octokit, makeConfig(), {
      spawnFn: makeSpawnFn(0, [
        'Implementing the requested changes.',
        '## Changes Made',
        '- Added try/catch around the main handler',
      ]),
      execFileFn: makeExecFileFn(0),
    });

    const successComment = octokit._comments.find(c => c.startsWith('✅'));
    assert.ok(successComment, 'success comment should be posted');
    assert.ok(successComment.includes('What was addressed'), 'should include What was addressed section');
    assert.ok(successComment.includes('What was changed'), 'should include What was changed section');
    assert.ok(successComment.includes('Please add error handling'), 'should include original comment text');
    assert.ok(!successComment.includes('Changes pushed to branch\n'), 'should not be the old bare message');

    cleanup();
  });
});
