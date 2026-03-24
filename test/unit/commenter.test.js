import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  postIssueComment,
  listIssueComments,
  postPRComment,
  listPRComments,
} from '../../src/github/commenter.js';

function makeOctokit() {
  const calls = [];
  return {
    calls,
    issues: {
      createComment: async (params) => { calls.push({ method: 'createComment', params }); return { data: { id: 123 } }; },
      listComments: async (params) => { calls.push({ method: 'listComments', params }); return { data: [] }; },
    },
    pulls: {
      createReviewComment: async (params) => { calls.push({ method: 'createReviewComment', params }); return { data: { id: 456 } }; },
      listReviewComments: async (params) => { calls.push({ method: 'listReviewComments', params }); return { data: [] }; },
    },
  };
}

describe('postIssueComment', () => {
  test('calls issues.createComment with correct params', async () => {
    const octokit = makeOctokit();
    await postIssueComment(octokit, 'owner/repo', 42, 'Hello!');
    const call = octokit.calls.find(c => c.method === 'createComment');
    assert.ok(call);
    assert.equal(call.params.owner, 'owner');
    assert.equal(call.params.repo, 'repo');
    assert.equal(call.params.issue_number, 42);
    assert.equal(call.params.body, 'Hello!');
  });
});

describe('listIssueComments', () => {
  test('calls issues.listComments with since filter', async () => {
    const octokit = makeOctokit();
    const since = '2025-01-01T00:00:00Z';
    await listIssueComments(octokit, 'owner/repo', 42, since);
    const call = octokit.calls.find(c => c.method === 'listComments');
    assert.ok(call);
    assert.equal(call.params.issue_number, 42);
    assert.equal(call.params.since, since);
  });

  test('works without since parameter', async () => {
    const octokit = makeOctokit();
    await listIssueComments(octokit, 'owner/repo', 42);
    const call = octokit.calls.find(c => c.method === 'listComments');
    assert.ok(call);
  });
});

describe('postPRComment', () => {
  test('calls issues.createComment (PR comments use same endpoint)', async () => {
    const octokit = makeOctokit();
    await postPRComment(octokit, 'owner/repo', 7, 'PR feedback');
    const call = octokit.calls.find(c => c.method === 'createComment');
    assert.ok(call);
    assert.equal(call.params.issue_number, 7);
    assert.equal(call.params.body, 'PR feedback');
  });
});

describe('listPRComments', () => {
  test('calls issues.listComments for PR number', async () => {
    const octokit = makeOctokit();
    await listPRComments(octokit, 'owner/repo', 7);
    const call = octokit.calls.find(c => c.method === 'listComments');
    assert.ok(call);
    assert.equal(call.params.issue_number, 7);
  });
});
