import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import {
  enqueueJob, dequeueJob, markActive, markComplete, markFailed, markCancelled,
  getJob, listActive, listRecent, makeJobId,
  markRateLimited, requeueExpiredRateLimited, listRateLimited, requeueInterrupted,
} from '../../src/db/jobs.js';
import { appendLog, getLogTail } from '../../src/db/logs.js';
import { isCommentSeen, markCommentSeen } from '../../src/db/comments.js';
import {
  registerActivePr, listActivePrs, getActivePr, deregisterPr,
  isPrCommentSeen, markPrCommentSeen
} from '../../src/db/prs.js';
import { enqueuePrReview, dequeuePrReview } from '../../src/db/pr-reviews.js';

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: 42,
    issue_title: '[COCKPIT] add auth flow',
    issue_body: 'Add user authentication',
    spec_name: 'add auth flow',
    repo_path: '/repos/my-project',
    stage: 'idle',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('DB schema init', () => {
  let db;
  let tmpDir;
  let tmpFile;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-db-test-'));
    tmpFile = path.join(tmpDir, 'test.db');
    db = openDb(tmpFile);
  });
  after(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('all 6 tables exist', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);
    assert.deepEqual(tables, [
      'active_prs', 'job_logs', 'jobs', 'pr_review_jobs',
      'seen_comments', 'seen_pr_comments'
    ]);
  });

  test('WAL mode enabled', () => {
    const row = db.pragma('journal_mode', { simple: true });
    assert.equal(row, 'wal');
  });

  test('foreign keys on', () => {
    const row = db.pragma('foreign_keys', { simple: true });
    assert.equal(row, 1);
  });
});

describe('Job CRUD', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('enqueue and dequeue roundtrip', () => {
    const job = makeJob();
    const id = enqueueJob(db, job);
    assert.equal(id, job.id);
    const dequeued = dequeueJob(db);
    assert.ok(dequeued);
    assert.equal(dequeued.id, job.id);
    assert.equal(dequeued.spec_name, 'add auth flow');
  });

  test('dequeue returns null when empty', () => {
    const result = dequeueJob(db);
    assert.equal(result, null);
  });

  test('FIFO order', () => {
    const jobA = makeJob({ id: 'aaaa0001', issue_number: 1, created_at: '2025-01-01T00:00:00.000Z' });
    const jobB = makeJob({ id: 'bbbb0002', issue_number: 2, created_at: '2025-01-01T00:00:01.000Z' });
    enqueueJob(db, jobA);
    enqueueJob(db, jobB);
    const first = dequeueJob(db);
    const second = dequeueJob(db);
    assert.equal(first.id, 'aaaa0001');
    assert.equal(second.id, 'bbbb0002');
  });

  test('dedup: same issue returns existing id', () => {
    const job = makeJob({ id: 'orig0001', issue_number: 99 });
    const id1 = enqueueJob(db, job);
    const job2 = makeJob({ id: 'other999', issue_number: 99 });
    const id2 = enqueueJob(db, job2);
    assert.equal(id1, id2);
  });

  test('status transitions', () => {
    const job = makeJob({ issue_number: 200 });
    enqueueJob(db, job);
    markActive(db, job.id);
    assert.equal(getJob(db, job.id).status, 'active');
    markComplete(db, job.id);
    assert.equal(getJob(db, job.id).status, 'completed');
  });

  test('mark_failed sets error', () => {
    const job = makeJob({ issue_number: 201 });
    enqueueJob(db, job);
    markFailed(db, job.id, 'PTY exited with code 1');
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'failed');
    assert.ok(updated.error.includes('PTY'));
  });

  test('mark_cancelled', () => {
    const job = makeJob({ issue_number: 202 });
    enqueueJob(db, job);
    markCancelled(db, job.id);
    assert.equal(getJob(db, job.id).status, 'cancelled');
  });

  test('list_active returns active jobs', () => {
    const job = makeJob({ issue_number: 203 });
    enqueueJob(db, job);
    markActive(db, job.id);
    const active = listActive(db);
    assert.ok(active.some(j => j.id === job.id));
  });

  test('list_recent returns jobs', () => {
    const recent = listRecent(db);
    assert.ok(Array.isArray(recent));
    assert.ok(recent.length > 0);
  });
});

describe('Log module', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('append and get tail in order', () => {
    const job = makeJob({ issue_number: 300 });
    enqueueJob(db, job);
    appendLog(db, job.id, 'line one');
    appendLog(db, job.id, 'line two');
    appendLog(db, job.id, 'line three');
    const tail = getLogTail(db, job.id, 2);
    assert.deepEqual(tail, ['line two', 'line three']);
  });

  test('1000-line buffer trims oldest', () => {
    const job = makeJob({ issue_number: 301 });
    enqueueJob(db, job);
    for (let i = 0; i < 1050; i++) appendLog(db, job.id, `line ${i}`);
    const tail = getLogTail(db, job.id, 9999);
    assert.ok(tail.length <= 1000);
  });
});

describe('Comment dedup', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('is/mark comment seen', () => {
    const job = makeJob({ issue_number: 400 });
    enqueueJob(db, job);
    assert.equal(isCommentSeen(db, job.id, 999), false);
    markCommentSeen(db, job.id, 999);
    assert.equal(isCommentSeen(db, job.id, 999), true);
  });
});

describe('Active PR tracking', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('register, get, list, deregister', () => {
    const job = makeJob({ issue_number: 500 });
    enqueueJob(db, job);
    const pr = {
      job_id: job.id,
      github_repo: 'owner/repo',
      pr_number: 7,
      issue_number: 42,
      repo_path: '/repos/my-project',
      registered_at: new Date().toISOString(),
    };
    registerActivePr(db, pr);
    const prs = listActivePrs(db);
    assert.equal(prs.length, 1);
    assert.equal(prs[0].pr_number, 7);
    const fetched = getActivePr(db, 'owner/repo', 7);
    assert.ok(fetched);
    assert.equal(fetched.job_id, job.id);
    deregisterPr(db, 'owner/repo', 7);
    assert.equal(listActivePrs(db).length, 0);
  });

  test('pr comment seen dedup', () => {
    assert.equal(isPrCommentSeen(db, 'owner/repo', 7, 'cmt_abc'), false);
    markPrCommentSeen(db, 'owner/repo', 7, 'cmt_abc');
    assert.equal(isPrCommentSeen(db, 'owner/repo', 7, 'cmt_abc'), true);
  });
});

describe('PR review queue', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('enqueue and dequeue pr review', () => {
    const review = {
      id: 'rev00001',
      github_repo: 'owner/repo',
      pr_number: 7,
      issue_number: 42,
      repo_path: '/repos/my-project',
      comment_id: 'cmt_xyz',
      comment_body: 'LGTM',
      pr_url: 'https://github.com/owner/repo/pull/7',
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    enqueuePrReview(db, review);
    const dequeued = dequeuePrReview(db);
    assert.ok(dequeued);
    assert.equal(dequeued.id, 'rev00001');
    assert.equal(dequeued.comment_body, 'LGTM');
  });
});

// ── Rate-limit DB functions (T009) ─────────────────────────────────────────

describe('markRateLimited', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('sets status to rate_limited with correct fields', () => {
    const job = makeJob({ issue_number: 600 });
    enqueueJob(db, job);
    markActive(db, job.id);
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    markRateLimited(db, job.id, resetAt, 1);
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'rate_limited');
    assert.equal(updated.rate_limit_reset_at, resetAt);
    assert.equal(updated.rate_limit_count, 1);
  });

  test('increments count correctly on successive calls', () => {
    const job = makeJob({ issue_number: 601 });
    enqueueJob(db, job);
    markRateLimited(db, job.id, new Date().toISOString(), 1);
    assert.equal(getJob(db, job.id).rate_limit_count, 1);
    markRateLimited(db, job.id, new Date().toISOString(), 2);
    assert.equal(getJob(db, job.id).rate_limit_count, 2);
  });

  test('accepts null resetAt (fallback case)', () => {
    const job = makeJob({ issue_number: 602 });
    enqueueJob(db, job);
    markRateLimited(db, job.id, null, 1);
    const updated = getJob(db, job.id);
    assert.equal(updated.status, 'rate_limited');
    assert.equal(updated.rate_limit_reset_at, null);
  });
});

describe('requeueExpiredRateLimited', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('requeues job whose reset time is in the past', () => {
    const job = makeJob({ issue_number: 610 });
    enqueueJob(db, job);
    const pastTime = new Date(Date.now() - 1000).toISOString();
    markRateLimited(db, job.id, pastTime, 1);
    const count = requeueExpiredRateLimited(db);
    assert.equal(count, 1);
    assert.equal(getJob(db, job.id).status, 'queued');
    assert.equal(getJob(db, job.id).rate_limit_reset_at, null);
  });

  test('does NOT requeue job whose reset time is in the future', () => {
    const job = makeJob({ issue_number: 611 });
    enqueueJob(db, job);
    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    markRateLimited(db, job.id, futureTime, 1);
    const count = requeueExpiredRateLimited(db);
    assert.equal(count, 0);
    assert.equal(getJob(db, job.id).status, 'rate_limited');
  });

  test('requeues job with null resetAt (unknown reset time)', () => {
    const job = makeJob({ issue_number: 612 });
    enqueueJob(db, job);
    markRateLimited(db, job.id, null, 1);
    const count = requeueExpiredRateLimited(db);
    assert.equal(count, 1);
    assert.equal(getJob(db, job.id).status, 'queued');
  });

  test('preserves rate_limit_count when requeuing', () => {
    const job = makeJob({ issue_number: 613 });
    enqueueJob(db, job);
    markRateLimited(db, job.id, new Date(Date.now() - 1000).toISOString(), 2);
    requeueExpiredRateLimited(db);
    assert.equal(getJob(db, job.id).rate_limit_count, 2);
  });
});

describe('listRateLimited', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('returns only rate_limited jobs', () => {
    const rl = makeJob({ issue_number: 620 });
    const active = makeJob({ issue_number: 621 });
    enqueueJob(db, rl);
    enqueueJob(db, active);
    markRateLimited(db, rl.id, null, 1);
    markActive(db, active.id);
    const results = listRateLimited(db);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, rl.id);
  });

  test('returns empty array when no rate-limited jobs', () => {
    const db2 = openDb(':memory:');
    const results = listRateLimited(db2);
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
    db2.close();
  });
});

// ── T019: requeueInterrupted does NOT touch rate_limited jobs ──────────────

describe('requeueInterrupted — leaves rate_limited jobs untouched', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('rate_limited job stays rate_limited after requeueInterrupted', () => {
    const job = makeJob({ issue_number: 630 });
    enqueueJob(db, job);
    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    markRateLimited(db, job.id, futureTime, 1);
    requeueInterrupted(db);
    assert.equal(getJob(db, job.id).status, 'rate_limited');
  });

  test('active job is requeued but rate_limited job is preserved', () => {
    const activeJob = makeJob({ issue_number: 631 });
    const rlJob = makeJob({ issue_number: 632 });
    enqueueJob(db, activeJob);
    enqueueJob(db, rlJob);
    markActive(db, activeJob.id);
    markRateLimited(db, rlJob.id, new Date(Date.now() + 3600000).toISOString(), 1);
    requeueInterrupted(db);
    assert.equal(getJob(db, activeJob.id).status, 'queued');
    assert.equal(getJob(db, rlJob.id).status, 'rate_limited');
  });
});
