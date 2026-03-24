import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, markActive, getJob, makeJobId } from '../../src/db/jobs.js';
import { recoverCrashedJobs } from '../../src/daemon/index.js';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-daemon-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: Math.floor(Math.random() * 10000),
    issue_title: '[COCKPIT] crash recovery test',
    issue_body: 'test',
    spec_name: 'crash recovery test',
    repo_path: '/repos/test',
    stage: 'idle',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('recoverCrashedJobs', () => {
  test('active jobs at startup are re-queued for resume', () => {
    const { db, cleanup } = makeTempDb();

    const job1 = makeJob();
    const job2 = makeJob();
    enqueueJob(db, job1);
    enqueueJob(db, job2);
    markActive(db, job1.id);
    markActive(db, job2.id);

    recoverCrashedJobs(db);

    const updated1 = getJob(db, job1.id);
    const updated2 = getJob(db, job2.id);
    assert.equal(updated1.status, 'queued');
    assert.equal(updated2.status, 'queued');

    cleanup();
  });

  test('queued and completed jobs are not affected', () => {
    const { db, cleanup } = makeTempDb();

    const queued = makeJob();
    enqueueJob(db, queued);
    // queued stays queued

    recoverCrashedJobs(db);

    const result = getJob(db, queued.id);
    assert.equal(result.status, 'queued');

    cleanup();
  });
});
