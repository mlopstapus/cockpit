import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig, writeConfig, validateConfig } from '../../src/config/index.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-test-'));
}

describe('readConfig', () => {
  let dir;
  before(() => { dir = makeTempDir(); });
  after(() => { fs.rmSync(dir, { recursive: true }); });

  test('roundtrip: write then read returns same object', () => {
    const cfg = {
      githubToken: 'ghp_abc123',
      githubOwner: 'testowner',
      pollIntervalSeconds: 45,
      postImplementCommand: '',
      repos: [{ repo: 'testowner/myrepo', localPath: '/repos/myrepo' }],
    };
    writeConfig(dir, cfg);
    const loaded = readConfig(dir);
    assert.deepEqual(loaded, cfg);
  });

  test('returns default pollIntervalSeconds=30 when not set', () => {
    const cfg = {
      githubToken: 'ghp_abc123',
      githubOwner: 'testowner',
      repos: [{ repo: 'testowner/myrepo', localPath: '/repos/myrepo' }],
    };
    const cfgPath = path.join(dir, 'config2.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const loaded = readConfig(dir, 'config2.json');
    assert.equal(loaded.pollIntervalSeconds, 30);
  });
});

describe('writeConfig', () => {
  let dir;
  before(() => { dir = makeTempDir(); });
  after(() => { fs.rmSync(dir, { recursive: true }); });

  test('creates config.json file', () => {
    const cfg = {
      githubToken: 'ghp_test',
      githubOwner: 'owner',
      pollIntervalSeconds: 30,
      postImplementCommand: '',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    writeConfig(dir, cfg);
    assert.ok(fs.existsSync(path.join(dir, 'config.json')));
  });

  test('sets file mode 0o600', () => {
    const cfg = {
      githubToken: 'ghp_test',
      githubOwner: 'owner',
      pollIntervalSeconds: 30,
      postImplementCommand: '',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    writeConfig(dir, cfg);
    const stat = fs.statSync(path.join(dir, 'config.json'));
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

describe('validateConfig', () => {
  test('passes valid config', () => {
    const cfg = {
      githubToken: 'ghp_abc',
      githubOwner: 'owner',
      pollIntervalSeconds: 30,
      postImplementCommand: '',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    assert.doesNotThrow(() => validateConfig(cfg));
  });

  test('throws on missing githubToken', () => {
    const cfg = {
      githubOwner: 'owner',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    assert.throws(() => validateConfig(cfg), /githubToken/);
  });

  test('throws on empty githubToken', () => {
    const cfg = {
      githubToken: '',
      githubOwner: 'owner',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    assert.throws(() => validateConfig(cfg), /githubToken/);
  });

  test('throws on missing githubOwner', () => {
    const cfg = {
      githubToken: 'ghp_abc',
      repos: [{ repo: 'owner/repo', localPath: '/repos/repo' }],
    };
    assert.throws(() => validateConfig(cfg), /githubOwner/);
  });

  test('throws on empty repos array', () => {
    const cfg = {
      githubToken: 'ghp_abc',
      githubOwner: 'owner',
      repos: [],
    };
    assert.throws(() => validateConfig(cfg), /repos/);
  });

  test('throws on missing repos field', () => {
    const cfg = {
      githubToken: 'ghp_abc',
      githubOwner: 'owner',
    };
    assert.throws(() => validateConfig(cfg), /repos/);
  });
});
