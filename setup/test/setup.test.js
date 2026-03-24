/**
 * Tests for setup CLI helper functions.
 * Run with: node --test test/setup.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const setupDir = join(__dirname, '..');

// ── renderTemplate ─────────────────────────────────────────────────────────

test('renderTemplate: replaces all known tokens', async () => {
  const { renderTemplate } = await import('../render.js');

  // Write a temporary template
  const tmpDir = join(os.tmpdir(), `cockpit-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tplPath = join(tmpDir, 'test.template');
  writeFileSync(tplPath, 'Hello {{NAME}}, your token is {{TOKEN}}.');

  const result = renderTemplate(tplPath, { NAME: 'Alice', TOKEN: 'abc123' });
  assert.equal(result, 'Hello Alice, your token is abc123.');

  rmSync(tmpDir, { recursive: true });
});

test('renderTemplate: leaves unknown tokens untouched', async () => {
  const { renderTemplate } = await import('../render.js');

  const tmpDir = join(os.tmpdir(), `cockpit-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tplPath = join(tmpDir, 'test.template');
  writeFileSync(tplPath, '{{KNOWN}} and {{UNKNOWN}}');

  const result = renderTemplate(tplPath, { KNOWN: 'replaced' });
  assert.equal(result, 'replaced and {{UNKNOWN}}');

  rmSync(tmpDir, { recursive: true });
});

// ── collectCockpitConfig --yes mode ───────────────────────────────────────

test('collectCockpitConfig: --yes mode returns defaults without prompting', async () => {
  const { collectCockpitConfig } = await import('../prompts.js');

  // Set env vars that --yes mode reads
  process.env.GITHUB_TOKEN = 'ghp_test_token';
  process.env.GITHUB_OWNER = 'test-owner';
  process.env.GITHUB_REPOS = 'test-owner/repo-a,test-owner/repo-b';
  process.env.POST_IMPLEMENT_COMMAND = 'echo done';
  process.env.DB_PATH = '/tmp/test.db';

  const profile = await collectCockpitConfig({ yes: true, target: '/tmp/test-repo' });

  assert.equal(profile.githubToken, 'ghp_test_token');
  assert.equal(profile.githubOwner, 'test-owner');
  assert.deepEqual(profile.githubRepos, ['test-owner/repo-a', 'test-owner/repo-b']);
  assert.equal(profile.postImplementCommand, 'echo done');
  assert.equal(profile.dbPath, '/tmp/test.db');
  assert.equal(profile.targetRepoPath, '/tmp/test-repo');
  assert(typeof profile.os === 'string');
  assert(typeof profile.username === 'string');

  // Cleanup
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPOS;
  delete process.env.POST_IMPLEMENT_COMMAND;
  delete process.env.DB_PATH;
});

// ── writeServiceFile: OS detection branching ──────────────────────────────

test('writeServiceFile: selects systemd template on linux', async () => {
  const { renderTemplate } = await import('../render.js');

  const templatePath = join(setupDir, 'templates', 'cockpit-api@.service.template');
  const rendered = renderTemplate(templatePath, {
    USERNAME: 'testuser',
    COCKPIT_DIR: '/home/testuser/cockpit',
  });

  // Must be a systemd unit, not a plist
  assert.match(rendered, /\[Unit\]/);
  assert.match(rendered, /\[Service\]/);
  assert.match(rendered, /User=testuser/);
  assert.match(rendered, /WorkingDirectory=\/home\/testuser\/cockpit/);
  assert.doesNotMatch(rendered, /\{\{USERNAME\}\}/); // all tokens replaced
});

test('writeServiceFile: selects launchd template on darwin', async () => {
  const { renderTemplate } = await import('../render.js');

  const templatePath = join(setupDir, 'templates', 'com.cockpit.api.plist.template');
  const rendered = renderTemplate(templatePath, {
    USERNAME: 'testuser',
    COCKPIT_DIR: '/Users/testuser/cockpit',
    HOME: '/Users/testuser',
    GITHUB_TOKEN: 'tok',
    GITHUB_OWNER: 'owner',
    GITHUB_REPOS: 'owner/repo',
    REPO_LOCAL_PATHS: '{}',
    DB_PATH: '/Users/testuser/.cockpit/cockpit.db',
    POST_IMPLEMENT_COMMAND: '',
  });

  // Must be a launchd plist, not a systemd unit
  assert.match(rendered, /<!DOCTYPE plist/);
  assert.match(rendered, /com\.cockpit\.api/);
  assert.match(rendered, /\/Users\/testuser\/cockpit/);
  assert.doesNotMatch(rendered, /\{\{COCKPIT_DIR\}\}/); // all tokens replaced
});
