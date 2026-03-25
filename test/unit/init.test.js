import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkPrereqs,
  buildConfigFromEnv,
  getServicePath,
  buildServiceContent,
  writeConstitution,
  maskToken,
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

describe('writeConstitution', () => {
  test('creates .specify/memory/constitution.md when none exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-test-'));
    try {
      writeConstitution(dir, { projectName: 'MyApp', principles: 'Test-first. No hacks.' });
      const outPath = path.join(dir, '.specify', 'memory', 'constitution.md');
      assert.ok(fs.existsSync(outPath), 'constitution.md should be created');
      const content = fs.readFileSync(outPath, 'utf8');
      assert.ok(content.includes('# MyApp Constitution'));
      assert.ok(content.includes('Test-first. No hacks.'));
      assert.ok(content.includes('1.0.0'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('creates parent directories if they do not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-test-'));
    try {
      writeConstitution(dir, { projectName: 'X', principles: 'Keep it simple.' });
      assert.ok(fs.existsSync(path.join(dir, '.specify', 'memory', 'constitution.md')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skips write and logs a message when constitution already exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-test-'));
    try {
      const constitutionPath = path.join(dir, '.specify', 'memory', 'constitution.md');
      fs.mkdirSync(path.dirname(constitutionPath), { recursive: true });
      fs.writeFileSync(constitutionPath, '# Original\n');

      const logs = [];
      const logger = { log: msg => logs.push(msg), warn: msg => logs.push(msg) };
      writeConstitution(dir, { projectName: 'X', principles: 'New.' }, { logger });

      // File should not have been overwritten
      assert.ok(fs.readFileSync(constitutionPath, 'utf8').includes('# Original'));
      // User should be told how to update it
      assert.ok(logs.some(l => l.includes('already exists')));
      assert.ok(logs.some(l => l.includes('/speckit.constitution')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// T001: maskToken helper
describe('maskToken', () => {
  test('long token shows first 4 + ***... + last 4', () => {
    assert.equal(maskToken('ghp_abcdefghijklmnop'), 'ghp_***...mnop');
  });

  test('short token (<=8 chars) returns ***', () => {
    assert.equal(maskToken('abc'), '***');
    assert.equal(maskToken('12345678'), '***');
  });

  test('exactly 9 chars shows first 4 + ***... + last 4', () => {
    assert.equal(maskToken('123456789'), '1234***...6789');
  });

  test('non-ghp prefix still masks correctly', () => {
    assert.equal(maskToken('github_pat_abc123xyz789'), 'gith***...z789');
  });

  test('never returns the full token for tokens longer than 8 chars', () => {
    const token = 'ghp_averylongtokenthatshouldbefullymasked';
    const result = maskToken(token);
    assert.ok(!result.includes(token), 'full token must not appear in masked output');
    assert.ok(result.includes('***...'), 'masked output must contain ***...');
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
