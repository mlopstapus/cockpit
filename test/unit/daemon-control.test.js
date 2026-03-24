import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  getDaemonStatus,
  getStartCommand,
  getStopCommand,
  getRestartCommand,
} from '../../src/cli/daemon-control.js';

describe('getStartCommand', () => {
  test('Linux returns systemctl --user start', () => {
    const cmd = getStartCommand('linux');
    assert.ok(cmd.includes('systemctl --user start'), `Got: ${cmd}`);
  });

  test('macOS returns launchctl start', () => {
    const cmd = getStartCommand('darwin');
    assert.ok(cmd.includes('launchctl'), `Got: ${cmd}`);
    assert.ok(cmd.includes('start'), `Got: ${cmd}`);
  });
});

describe('getStopCommand', () => {
  test('Linux returns systemctl --user stop', () => {
    const cmd = getStopCommand('linux');
    assert.ok(cmd.includes('systemctl --user stop'), `Got: ${cmd}`);
  });

  test('macOS returns launchctl stop', () => {
    const cmd = getStopCommand('darwin');
    assert.ok(cmd.includes('launchctl'), `Got: ${cmd}`);
    assert.ok(cmd.includes('stop'), `Got: ${cmd}`);
  });
});

describe('getRestartCommand', () => {
  test('Linux returns systemctl --user restart', () => {
    const cmds = getRestartCommand('linux');
    assert.ok(Array.isArray(cmds) ? cmds.some(c => c.includes('restart')) : cmds.includes('restart'));
  });

  test('macOS returns stop then start commands', () => {
    const cmds = getRestartCommand('darwin');
    const arr = Array.isArray(cmds) ? cmds : [cmds];
    assert.ok(arr.some(c => c.includes('stop') || c.includes('unload')));
    assert.ok(arr.some(c => c.includes('start') || c.includes('load')));
  });
});

describe('getDaemonStatus', () => {
  test('returns not_running when PID file missing', () => {
    const status = getDaemonStatus({ pidFile: '/tmp/does-not-exist-cockpit.pid' });
    assert.equal(status.running, false);
    assert.equal(status.reason, 'no_pid_file');
  });

  test('returns running=true when PID file has current process PID', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ctl-test-'));
    const pidFile = path.join(tmpDir, 'daemon.pid');
    // Use current process PID — we know it's alive
    fs.writeFileSync(pidFile, String(process.pid));
    const status = getDaemonStatus({ pidFile });
    assert.equal(status.running, true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('returns not_running when PID file has non-existent PID', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ctl-test-'));
    const pidFile = path.join(tmpDir, 'daemon.pid');
    // PID 999999 is almost certainly not running
    fs.writeFileSync(pidFile, '999999999');
    const status = getDaemonStatus({ pidFile });
    assert.equal(status.running, false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
