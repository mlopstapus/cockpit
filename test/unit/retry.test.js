import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, markFailed, markActive, markComplete, makeJobId } from '../../src/db/jobs.js';
import { retryFailedJob } from '../../src/cli/retry.js';

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: 1,
    issue_title: '[COCKPIT] test feature',
    issue_body: '',
    spec_name: 'test feature',
    repo_path: '/repos/test',
    stage: 'implement',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeIo() {
  const io = { logs: [], errors: [], exitCode: null };
  io.log = (msg) => io.logs.push(msg);
  io.error = (msg) => io.errors.push(msg);
  io.exit = (code) => { io.exitCode = code; throw new Error(`exit:${code}`); };
  return io;
}

// ── US1: cockpit retry <job-id> ───────────────────────────────────────────────

describe('retryFailedJob — retry by ID (US1)', () => {
  let db;
  before(() => { db = openDb(':memory:'); });
  after(() => { db.close(); });

  test('success: prints confirmation with job ID and stage, no exit called', () => {
    const job = makeJob({ issue_number: 10, stage: 'implement' });
    enqueueJob(db, job);
    markFailed(db, job.id, 'PTY crashed');

    const io = makeIo();
    retryFailedJob(db, job.id, {}, io);

    assert.equal(io.exitCode, null);
    assert.equal(io.logs.length, 1);
    assert.ok(io.logs[0].includes(job.id), 'confirmation should include job ID');
    assert.ok(io.logs[0].includes('implement'), 'confirmation should include stage name');
  });

  test('unknown ID: exits 1 with "not found" message', () => {
    const io = makeIo();
    assert.throws(() => retryFailedJob(db, 'deadbeef', {}, io), /exit:1/);
    assert.equal(io.exitCode, 1);
    assert.ok(io.errors.some(e => e.includes('deadbeef') && /not found/i.test(e)));
  });

  test('non-failed status (active): exits 1 with "not in a failed state" message', () => {
    const job = makeJob({ issue_number: 11 });
    enqueueJob(db, job);
    markActive(db, job.id);

    const io = makeIo();
    assert.throws(() => retryFailedJob(db, job.id, {}, io), /exit:1/);
    assert.equal(io.exitCode, 1);
    assert.ok(io.errors.some(e => /not in a failed state/i.test(e)));
    assert.ok(io.errors.some(e => e.includes('active')));
  });

  test('non-failed status (completed): exits 1 with "not in a failed state" message', () => {
    const job = makeJob({ issue_number: 12 });
    enqueueJob(db, job);
    markComplete(db, job.id);

    const io = makeIo();
    assert.throws(() => retryFailedJob(db, job.id, {}, io), /exit:1/);
    assert.equal(io.exitCode, 1);
    assert.ok(io.errors.some(e => /not in a failed state/i.test(e)));
    assert.ok(io.errors.some(e => e.includes('completed')));
  });

  test('FR-010: succeeds without daemon running (direct DB call, no daemon dependency)', () => {
    // This test validates FR-010 by design: retryFailedJob only uses the db
    // argument — no daemon process, PID file, or IPC is involved.
    const job = makeJob({ issue_number: 13, stage: 'specify' });
    enqueueJob(db, job);
    markFailed(db, job.id, 'network error');

    const io = makeIo();
    // Should succeed with no daemon running — if it throws for any reason
    // other than an intentional exit, the test will fail.
    retryFailedJob(db, job.id, {}, io);
    assert.equal(io.exitCode, null);
    assert.equal(io.logs.length >= 1, true);
  });
});

// ── US2: cockpit retry --last ─────────────────────────────────────────────────

describe('retryFailedJob — --last flag (US2)', () => {
  test('--last with one failed job: requeues it and shows its ID', () => {
    const freshDb = openDb(':memory:');
    try {
      const job = makeJob({ issue_number: 20, stage: 'clarify' });
      enqueueJob(freshDb, job);
      markFailed(freshDb, job.id, 'timeout');

      const io = makeIo();
      retryFailedJob(freshDb, undefined, { last: true }, io);

      assert.equal(io.exitCode, null);
      assert.ok(io.logs.some(l => l.includes(job.id)), 'output must include the retried job ID');
    } finally {
      freshDb.close();
    }
  });

  test('--last with multiple failed jobs: selects most recently updated', () => {
    const freshDb = openDb(':memory:');
    try {
      const older = makeJob({ issue_number: 21, stage: 'plan' });
      const newer = makeJob({ issue_number: 22, stage: 'tasks' });
      enqueueJob(freshDb, older);
      enqueueJob(freshDb, newer);
      markFailed(freshDb, older.id, 'old fail');
      markFailed(freshDb, newer.id, 'new fail');
      freshDb.prepare("UPDATE jobs SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(older.id);
      freshDb.prepare("UPDATE jobs SET updated_at = '2025-01-01T00:00:00.000Z' WHERE id = ?").run(newer.id);

      const io = makeIo();
      retryFailedJob(freshDb, undefined, { last: true }, io);

      assert.equal(io.exitCode, null);
      assert.ok(io.logs.some(l => l.includes(newer.id)), 'should retry the more recently failed job');
      assert.ok(!io.logs.some(l => l.includes(older.id)), 'should not retry the older job');
    } finally {
      freshDb.close();
    }
  });

  test('--last with no failed jobs: exits 1 with clear message', () => {
    const freshDb = openDb(':memory:');
    try {
      const io = makeIo();
      assert.throws(() => retryFailedJob(freshDb, undefined, { last: true }, io), /exit:1/);
      assert.equal(io.exitCode, 1);
      assert.ok(io.errors.some(e => /no failed jobs/i.test(e)));
    } finally {
      freshDb.close();
    }
  });

  test('both job-id and --last supplied: exits 1 with "cannot specify both" message', () => {
    const freshDb = openDb(':memory:');
    try {
      const job = makeJob({ issue_number: 23 });
      enqueueJob(freshDb, job);
      markFailed(freshDb, job.id, 'err');

      const io = makeIo();
      assert.throws(() => retryFailedJob(freshDb, job.id, { last: true }, io), /exit:1/);
      assert.equal(io.exitCode, 1);
      assert.ok(io.errors.some(e => /cannot specify both/i.test(e)));
    } finally {
      freshDb.close();
    }
  });
});
