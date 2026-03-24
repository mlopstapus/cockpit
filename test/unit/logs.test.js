import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/db/index.js';
import { enqueueJob, makeJobId } from '../../src/db/jobs.js';
import { appendLog } from '../../src/db/logs.js';
import { getJobLogs } from '../../src/cli/logs.js';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-logs-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeJob(overrides = {}) {
  return {
    id: makeJobId(),
    github_repo: 'owner/repo',
    issue_number: Math.floor(Math.random() * 10000),
    issue_title: '[COCKPIT] test',
    issue_body: '',
    spec_name: 'test',
    repo_path: '/repos/test',
    stage: 'idle',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('getJobLogs', () => {
  test('returns last N lines from DB (default 50)', () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob();
    enqueueJob(db, job);
    for (let i = 0; i < 60; i++) appendLog(db, job.id, `line ${i}`);
    const lines = getJobLogs(db, job.id);
    assert.ok(lines.length <= 50);
    assert.ok(lines[lines.length - 1].includes('59'));
    cleanup();
  });

  test('-n override returns n lines', () => {
    const { db, cleanup } = makeTempDb();
    const job = makeJob();
    enqueueJob(db, job);
    for (let i = 0; i < 20; i++) appendLog(db, job.id, `line ${i}`);
    const lines = getJobLogs(db, job.id, 10);
    assert.equal(lines.length, 10);
    cleanup();
  });

  test('returns null when job not found', () => {
    const { db, cleanup } = makeTempDb();
    const result = getJobLogs(db, 'nonexistent-job-id');
    assert.equal(result, null);
    cleanup();
  });
});
