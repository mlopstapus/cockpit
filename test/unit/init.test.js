import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  checkPrereqs,
  buildConfigFromEnv,
  getServicePath,
  buildServiceContent,
} from '../../src/cli/init.js';

// T018: prerequisite checker
describe('checkPrereqs', () => {
  test('succeeds when git and claude are present', () => {
    const which = (cmd) => `/usr/bin/${cmd}`;
    const warnings = [];
    const result = checkPrereqs({
      which,
      logger: { warn: (msg) => warnings.push(msg), error: () => {} },
    });
    assert.equal(result.ok, true);
    assert.equal(warnings.length, 0);
  });

  test('returns error when git is missing', () => {
    const which = (cmd) => { if (cmd === 'git') throw new Error('not found'); return '/usr/bin/claude'; };
    const result = checkPrereqs({
      which,
      logger: { warn: () => {}, error: () => {} },
    });
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes('git'));
    assert.equal(result.exitCode, 2);
  });

  test('returns error when claude is missing', () => {
    const which = (cmd) => { if (cmd === 'claude') throw new Error('not found'); return '/usr/bin/git'; };
    const result = checkPrereqs({
      which,
      logger: { warn: () => {}, error: () => {} },
    });
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes('claude'));
    assert.equal(result.exitCode, 2);
  });

  test('warns but continues when uv is missing', () => {
    const which = (cmd) => {
      if (cmd === 'uv') throw new Error('not found');
      return `/usr/bin/${cmd}`;
    };
    const warnings = [];
    const result = checkPrereqs({
      which,
      logger: { warn: (msg) => warnings.push(msg), error: () => {} },
    });
    assert.equal(result.ok, true);
    assert.ok(warnings.some(w => w.includes('uv')));
  });
});

// T019: --yes mode env var parsing
describe('buildConfigFromEnv', () => {
  test('reads all 6 env vars correctly', () => {
    const env = {
      GITHUB_TOKEN: 'ghp_abc',
      GITHUB_OWNER: 'myowner',
      GITHUB_REPOS: 'myowner/repoA,myowner/repoB',
      REPO_LOCAL_PATHS: JSON.stringify({
        'myowner/repoA': '/repos/repoA',
        'myowner/repoB': '/repos/repoB',
      }),
      POLL_INTERVAL: '60',
      POST_IMPLEMENT_COMMAND: 'npm test',
    };
    const config = buildConfigFromEnv(env);
    assert.equal(config.githubToken, 'ghp_abc');
    assert.equal(config.githubOwner, 'myowner');
    assert.equal(config.pollIntervalSeconds, 60);
    assert.equal(config.postImplementCommand, 'npm test');
    assert.equal(config.repos.length, 2);
    assert.equal(config.repos[0].repo, 'myowner/repoA');
    assert.equal(config.repos[0].localPath, '/repos/repoA');
    assert.equal(config.repos[1].repo, 'myowner/repoB');
    assert.equal(config.repos[1].localPath, '/repos/repoB');
  });

  test('throws when GITHUB_TOKEN is missing', () => {
    const env = {
      GITHUB_OWNER: 'myowner',
      GITHUB_REPOS: 'myowner/repoA',
      REPO_LOCAL_PATHS: JSON.stringify({ 'myowner/repoA': '/repos/repoA' }),
    };
    assert.throws(() => buildConfigFromEnv(env), /GITHUB_TOKEN/);
  });

  test('uses default pollIntervalSeconds=30 when POLL_INTERVAL not set', () => {
    const env = {
      GITHUB_TOKEN: 'ghp_abc',
      GITHUB_OWNER: 'myowner',
      GITHUB_REPOS: 'myowner/repoA',
      REPO_LOCAL_PATHS: JSON.stringify({ 'myowner/repoA': '/repos/repoA' }),
    };
    const config = buildConfigFromEnv(env);
    assert.equal(config.pollIntervalSeconds, 30);
  });

  test('parses multiple repos from comma-separated GITHUB_REPOS', () => {
    const repos = ['myowner/a', 'myowner/b', 'myowner/c'];
    const paths = {};
    repos.forEach((r, i) => { paths[r] = `/repos/${i}`; });
    const env = {
      GITHUB_TOKEN: 'ghp_abc',
      GITHUB_OWNER: 'myowner',
      GITHUB_REPOS: repos.join(','),
      REPO_LOCAL_PATHS: JSON.stringify(paths),
    };
    const config = buildConfigFromEnv(env);
    assert.equal(config.repos.length, 3);
  });
});

// T020: service file writer helpers
describe('getServicePath', () => {
  test('Linux path goes to ~/.config/systemd/user/', () => {
    const p = getServicePath('linux', '/home/user');
    assert.ok(p.includes('.config/systemd/user'));
    assert.ok(p.endsWith('cockpit-daemon.service'));
  });

  test('macOS path goes to ~/Library/LaunchAgents/', () => {
    const p = getServicePath('darwin', '/Users/user');
    assert.ok(p.includes('Library/LaunchAgents'));
    assert.ok(p.endsWith('com.cockpit.daemon.plist'));
  });
});

describe('buildServiceContent', () => {
  test('replaces tokens in template', () => {
    const template = 'USER={{USERNAME}} DIR={{COCKPIT_DIR}} NODE={{NODE_PATH}}';
    const result = buildServiceContent(template, {
      '{{USERNAME}}': 'testuser',
      '{{COCKPIT_DIR}}': '/home/testuser/.cockpit',
      '{{NODE_PATH}}': '/usr/bin/node',
    });
    assert.equal(result, 'USER=testuser DIR=/home/testuser/.cockpit NODE=/usr/bin/node');
  });

  test('replaces all occurrences of a token', () => {
    const template = '{{TOKEN}} and {{TOKEN}}';
    const result = buildServiceContent(template, { '{{TOKEN}}': 'replaced' });
    assert.equal(result, 'replaced and replaced');
  });
});
