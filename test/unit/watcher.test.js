import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/index.js';
import { pollRepo, RateLimitError } from '../../src/github/watcher.js';
import { listRecent } from '../../src/db/jobs.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-watcher-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

function makeOctokit(issues = [], status = 200, headers = {}) {
  return {
    issues: {
      listForRepo: async () => ({ data: issues, status, headers }),
    },
  };
}

const owner = 'testowner';
const repo = { repo: 'testowner/myrepo', localPath: '/repos/myrepo' };

describe('pollRepo — filtering', () => {
  test('[COCKPIT] prefix is enqueued', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 1, title: '[COCKPIT] add auth', body: 'desc', user: { login: owner }, state: 'open' },
    ];
    await pollRepo(makeOctokit(issues), db, repo.repo, repo.localPath, owner);
    const jobs = listRecent(db);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].issue_number, 1);
    cleanup();
  });

  test('non-[COCKPIT] prefix is skipped', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 2, title: 'regular issue', body: '', user: { login: owner }, state: 'open' },
    ];
    await pollRepo(makeOctokit(issues), db, repo.repo, repo.localPath, owner);
    assert.equal(listRecent(db).length, 0);
    cleanup();
  });

  test('wrong owner is skipped', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 3, title: '[COCKPIT] other owner', body: '', user: { login: 'otheruser' }, state: 'open' },
    ];
    await pollRepo(makeOctokit(issues), db, repo.repo, repo.localPath, owner);
    assert.equal(listRecent(db).length, 0);
    cleanup();
  });

  test('PR-type item (has pull_request key) is skipped', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 4, title: '[COCKPIT] pr item', body: '', user: { login: owner }, state: 'open', pull_request: { url: 'https://...' } },
    ];
    await pollRepo(makeOctokit(issues), db, repo.repo, repo.localPath, owner);
    assert.equal(listRecent(db).length, 0);
    cleanup();
  });

  test('repo with empty localPath is skipped with no job enqueued', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 5, title: '[COCKPIT] valid', body: '', user: { login: owner }, state: 'open' },
    ];
    const warnings = [];
    await pollRepo(makeOctokit(issues), db, repo.repo, '', owner, { warn: (m) => warnings.push(m) });
    assert.equal(listRecent(db).length, 0);
    assert.ok(warnings.some(w => w.includes('localPath')));
    cleanup();
  });

  test('repo with missing localPath is skipped with warning', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      { number: 6, title: '[COCKPIT] valid', body: '', user: { login: owner }, state: 'open' },
    ];
    const warnings = [];
    await pollRepo(makeOctokit(issues), db, repo.repo, null, owner, { warn: (m) => warnings.push(m) });
    assert.equal(listRecent(db).length, 0);
    assert.ok(warnings.length > 0);
    cleanup();
  });
});

describe('pollRepo — 429 rate limit', () => {
  test('throws RateLimitError with correct waitMs', async () => {
    const { db, cleanup } = makeTempDb();
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const octokit = {
      issues: {
        listForRepo: async () => {
          const err = Object.assign(new Error('rate limited'), {
            status: 429,
            response: { headers: { 'x-ratelimit-reset': String(resetAt) } },
          });
          throw err;
        },
      },
    };
    await assert.rejects(
      () => pollRepo(octokit, db, repo.repo, repo.localPath, owner),
      (err) => {
        assert.ok(err instanceof RateLimitError);
        assert.ok(err.waitMs > 0);
        return true;
      }
    );
    cleanup();
  });
});

describe('pollRepo — input sanitisation', () => {
  test('strips control characters from title and body', async () => {
    const { db, cleanup } = makeTempDb();
    const issues = [
      {
        number: 7,
        title: '[COCKPIT] clean\x00title\x1F',
        body: 'body\x01with\x7Fcontrols',
        user: { login: owner },
        state: 'open',
      },
    ];
    await pollRepo(makeOctokit(issues), db, repo.repo, repo.localPath, owner);
    const jobs = listRecent(db);
    assert.equal(jobs.length, 1);
    assert.ok(!jobs[0].issue_title.includes('\x00'));
    assert.ok(!jobs[0].issue_body.includes('\x01'));
    cleanup();
  });
});
