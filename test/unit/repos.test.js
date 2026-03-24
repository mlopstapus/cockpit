import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { writeConfig, readConfig } from '../../src/config/index.js';
import { repoAdd, repoRemove, repoList } from '../../src/cli/repos.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-repos-test-'));
}

function makeConfig(repos = []) {
  return {
    githubToken: 'ghp_test',
    githubOwner: 'owner',
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos,
  };
}

describe('repoAdd', () => {
  test('adds repo with valid format and updates config', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([{ repo: 'owner/existing', localPath: dir }]));
    const warnings = [];
    repoAdd(dir, 'owner/newrepo', dir, {}, { warn: (m) => warnings.push(m) });
    const config = readConfig(dir);
    assert.ok(config.repos.some(r => r.repo === 'owner/newrepo'));
    fs.rmSync(dir, { recursive: true });
  });

  test('emits warning when localPath does not exist but continues', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([]));
    const warnings = [];
    repoAdd(dir, 'owner/repo', '/nonexistent/path/xyz', {}, { warn: (m) => warnings.push(m) });
    const config = readConfig(dir);
    assert.ok(config.repos.some(r => r.repo === 'owner/repo'));
    assert.ok(warnings.some(w => w.includes('nonexistent') || w.includes('does not exist')));
    fs.rmSync(dir, { recursive: true });
  });
});

describe('repoRemove', () => {
  test('removes existing repo from config', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([
      { repo: 'owner/repo1', localPath: dir },
      { repo: 'owner/repo2', localPath: dir },
    ]));
    repoRemove(dir, 'owner/repo1');
    const config = readConfig(dir);
    assert.ok(!config.repos.some(r => r.repo === 'owner/repo1'));
    assert.ok(config.repos.some(r => r.repo === 'owner/repo2'));
    fs.rmSync(dir, { recursive: true });
  });

  test('throws when repo not in config', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([{ repo: 'owner/existing', localPath: dir }]));
    assert.throws(() => repoRemove(dir, 'owner/nothere'), /not found/i);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('repoList', () => {
  test('annotates repos with [exists] or [missing]', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([
      { repo: 'owner/exists', localPath: dir },
      { repo: 'owner/missing', localPath: '/no/such/path/xyz' },
    ]));
    const output = [];
    repoList(dir, { log: (m) => output.push(m) });
    const joined = output.join('\n');
    assert.ok(joined.includes('exists'));
    assert.ok(joined.includes('missing'));
    fs.rmSync(dir, { recursive: true });
  });

  test('displays startupCommand when set', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([
      { repo: 'owner/repo', localPath: dir, startupCommand: 'npm start' },
    ]));
    const output = [];
    repoList(dir, { log: (m) => output.push(m) });
    const joined = output.join('\n');
    assert.ok(joined.includes('npm start'), 'Expected startupCommand to appear in output');
    fs.rmSync(dir, { recursive: true });
  });

  test('does not display startup line when startupCommand is absent', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([
      { repo: 'owner/repo', localPath: dir },
    ]));
    const output = [];
    repoList(dir, { log: (m) => output.push(m) });
    const joined = output.join('\n');
    assert.ok(!joined.includes('startup'), 'Should not show startup line when not set');
    fs.rmSync(dir, { recursive: true });
  });
});

// ---------- T011: startup command CLI tests ----------

describe('repoAdd — startupCommand', () => {
  test('stores startupCommand when options.startupCommand is set', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([]));
    repoAdd(dir, 'owner/repo', dir, { startupCommand: 'npm run start' });
    const config = readConfig(dir);
    const repo = config.repos.find(r => r.repo === 'owner/repo');
    assert.ok(repo, 'Repo should be added');
    assert.equal(repo.startupCommand, 'npm run start');
    fs.rmSync(dir, { recursive: true });
  });

  test('stores repo without startupCommand field when options.startupCommand is absent', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([]));
    repoAdd(dir, 'owner/repo', dir, {});
    const config = readConfig(dir);
    const repo = config.repos.find(r => r.repo === 'owner/repo');
    assert.ok(repo, 'Repo should be added');
    assert.ok(!('startupCommand' in repo), 'startupCommand should not be present');
    fs.rmSync(dir, { recursive: true });
  });

  test('updates startupCommand in-place when repo already exists and options.startupCommand provided', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([{ repo: 'owner/repo', localPath: dir }]));
    repoAdd(dir, 'owner/repo', dir, { startupCommand: 'echo updated' });
    const config = readConfig(dir);
    const repos = config.repos.filter(r => r.repo === 'owner/repo');
    assert.equal(repos.length, 1, 'Should not duplicate repo');
    assert.equal(repos[0].startupCommand, 'echo updated');
    fs.rmSync(dir, { recursive: true });
  });

  test('warns and returns when repo already exists and no startupCommand provided', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([{ repo: 'owner/repo', localPath: dir }]));
    const warnings = [];
    repoAdd(dir, 'owner/repo', dir, {}, { warn: (m) => warnings.push(m) });
    assert.ok(warnings.some(w => w.includes('already configured') || w.includes('owner/repo')));
    fs.rmSync(dir, { recursive: true });
  });

  test('stores startupCommand with spaces and special chars verbatim', () => {
    const dir = makeTempDir();
    writeConfig(dir, makeConfig([]));
    const cmd = 'npm run build && echo "done $PWD"';
    repoAdd(dir, 'owner/repo', dir, { startupCommand: cmd });
    const config = readConfig(dir);
    assert.equal(config.repos.find(r => r.repo === 'owner/repo').startupCommand, cmd);
    fs.rmSync(dir, { recursive: true });
  });
});
