import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { registerActivePr, listActivePrs, isPrCommentSeen } from '../../src/db/prs.js';
import { pollActivePr } from '../../src/github/pr-watcher.js';
import { makeJobId, enqueueJob } from '../../src/db/jobs.js';

// ---------- helpers ----------

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-pr-watcher-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeActivePr(db, overrides = {}) {
  // Insert a real job first to satisfy active_prs.job_id FK
  const jobId = makeJobId();
  enqueueJob(db, {
    id: jobId,
    github_repo: 'owner/repo',
    issue_number: 99,
    issue_title: '[COCKPIT] test',
    issue_body: '',
    spec_name: 'test',
    repo_path: '/repos/test',
    stage: 'idle',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const pr = {
    github_repo: 'owner/repo',
    pr_number: 42,
    job_id: jobId,
    issue_number: 1,
    repo_path: '/repos/test',
    registered_at: new Date().toISOString(),
    pr_url: 'https://github.com/owner/repo/pull/42',
    ...overrides,
  };
  registerActivePr(db, pr);
  return pr;
}

function makeOctokit({ prState = 'open', comments = [] } = {}) {
  return {
    pulls: {
      get: async () => ({ data: { state: prState, merged: prState === 'merged' } }),
    },
    issues: {
      listComments: async () => ({ data: comments }),
      createComment: async ({ body }) => ({ data: { id: 999, body } }),
    },
  };
}

function makeComment(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 100000),
    body: 'Please add error handling',
    user: { login: 'owner' },
    ...overrides,
  };
}

const githubOwner = 'owner';

// ---------- filtering tests ----------

describe('pollActivePr — new owner comment is enqueued', () => {
  test('new comment from githubOwner triggers markPrCommentSeen and enqueuePrReview', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const comment = makeComment({ id: 101, body: 'Fix the bug', user: { login: githubOwner } });
    const octokit = makeOctokit({ comments: [comment] });

    await pollActivePr(octokit, db, pr, githubOwner);

    assert.ok(isPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id)),
      'comment should be marked seen');

    // PR should still be registered (not closed)
    const prs = listActivePrs(db);
    assert.equal(prs.length, 1);

    cleanup();
  });
});

describe('pollActivePr — bot comments are ignored', () => {
  const botPrefixes = ['👀', '✅', '❌', '⚠️', '🎉', '🚀', '💬'];

  for (const prefix of botPrefixes) {
    test(`comment starting with ${prefix} is ignored`, async () => {
      const { db, cleanup } = makeTempDb();
      const pr = makeActivePr(db);
      const comment = makeComment({ id: 200, body: `${prefix} some bot message`, user: { login: githubOwner } });
      const octokit = makeOctokit({ comments: [comment] });

      await pollActivePr(octokit, db, pr, githubOwner);

      assert.ok(!isPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id)),
        `bot prefix ${prefix} comment should NOT be marked seen`);

      cleanup();
    });
  }
});

describe('pollActivePr — non-owner comments are ignored', () => {
  test('comment from a different user is not processed', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const comment = makeComment({ id: 301, body: 'Please fix this', user: { login: 'somerandomer' } });
    const octokit = makeOctokit({ comments: [comment] });

    await pollActivePr(octokit, db, pr, githubOwner);

    assert.ok(!isPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id)),
      'non-owner comment should NOT be marked seen');

    cleanup();
  });
});

describe('pollActivePr — already-seen comments are not re-enqueued', () => {
  test('comment already in seen_pr_comments produces no new enqueuePrReview call', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const comment = makeComment({ id: 401, body: 'Already handled', user: { login: githubOwner } });

    // Pre-mark as seen
    const { markPrCommentSeen } = await import('../../src/db/prs.js');
    markPrCommentSeen(db, pr.github_repo, pr.pr_number, String(comment.id));

    const enqueueCallCount = { count: 0 };
    const octokit = makeOctokit({ comments: [comment] });

    await pollActivePr(octokit, db, pr, githubOwner);

    // The comment was already seen — no new pr_review_jobs should exist
    const jobs = db.prepare("SELECT * FROM pr_review_jobs").all();
    assert.equal(jobs.length, 0, 'no new review job should be created for already-seen comment');

    cleanup();
  });
});

describe('pollActivePr — merged PR is deregistered', () => {
  test('closed/merged PR triggers deregisterPr', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const octokit = makeOctokit({ prState: 'closed', comments: [] });

    await pollActivePr(octokit, db, pr, githubOwner);

    const prs = listActivePrs(db);
    assert.equal(prs.length, 0, 'PR should be deregistered when closed');

    cleanup();
  });

  test('open PR is NOT deregistered', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const octokit = makeOctokit({ prState: 'open', comments: [] });

    await pollActivePr(octokit, db, pr, githubOwner);

    const prs = listActivePrs(db);
    assert.equal(prs.length, 1, 'open PR should remain registered');

    cleanup();
  });
});

describe('pollActivePr — no comments → no action', () => {
  test('empty comments array produces no review jobs', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const octokit = makeOctokit({ prState: 'open', comments: [] });

    await pollActivePr(octokit, db, pr, githubOwner);

    const jobs = db.prepare("SELECT * FROM pr_review_jobs").all();
    assert.equal(jobs.length, 0);

    cleanup();
  });
});

// ---------- batch tests (US2) ----------

describe('pollActivePr — multiple comments batched into one job', () => {
  test('3 new comments → enqueuePrReview called once; markPrCommentSeen called 3 times', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const comments = [
      makeComment({ id: 501, body: 'Fix error handling', user: { login: githubOwner } }),
      makeComment({ id: 502, body: 'Add logging', user: { login: githubOwner } }),
      makeComment({ id: 503, body: 'Update README', user: { login: githubOwner } }),
    ];
    const octokit = makeOctokit({ comments });

    await pollActivePr(octokit, db, pr, githubOwner);

    // All 3 should be marked seen
    for (const c of comments) {
      assert.ok(isPrCommentSeen(db, pr.github_repo, pr.pr_number, String(c.id)),
        `comment ${c.id} should be marked seen`);
    }

    // Exactly one review job should be enqueued
    const jobs = db.prepare("SELECT * FROM pr_review_jobs").all();
    assert.equal(jobs.length, 1, 'exactly one review job for 3 comments');

    // comment_body should contain all 3 bodies joined
    assert.ok(jobs[0].comment_body.includes('Fix error handling'));
    assert.ok(jobs[0].comment_body.includes('Add logging'));
    assert.ok(jobs[0].comment_body.includes('Update README'));

    cleanup();
  });
});

describe('pollActivePr — input sanitisation', () => {
  test('control characters stripped from comment body before enqueueing', async () => {
    const { db, cleanup } = makeTempDb();
    const pr = makeActivePr(db);
    const comment = makeComment({
      id: 601,
      body: 'Fix this\x00thing\x1Fnow',
      user: { login: githubOwner },
    });
    const octokit = makeOctokit({ comments: [comment] });

    await pollActivePr(octokit, db, pr, githubOwner);

    const jobs = db.prepare("SELECT * FROM pr_review_jobs").all();
    assert.equal(jobs.length, 1);
    assert.ok(!jobs[0].comment_body.includes('\x00'), 'null byte should be stripped');
    assert.ok(!jobs[0].comment_body.includes('\x1F'), 'control char should be stripped');
    assert.ok(jobs[0].comment_body.includes('Fix this'), 'content should be preserved');

    cleanup();
  });
});
