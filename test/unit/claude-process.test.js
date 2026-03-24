import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSentinel, LineBuffer, createClaudeProcess } from '../../src/process/claude-process.js';

describe('detectSentinel', () => {
  test('detects specify sentinel', () => {
    assert.equal(detectSentinel('spec.md written successfully'), 'specify');
    assert.equal(detectSentinel('specification complete'), 'specify');
  });

  test('detects clarify sentinel', () => {
    assert.equal(detectSentinel('no clarification needed'), 'clarify');
    assert.equal(detectSentinel('clarifications recorded in spec'), 'clarify');
  });

  test('detects plan sentinel', () => {
    assert.equal(detectSentinel('plan.md written'), 'plan');
    assert.equal(detectSentinel('plan complete'), 'plan');
  });

  test('detects tasks sentinel', () => {
    assert.equal(detectSentinel('tasks.md written'), 'tasks');
  });

  test('detects analyze sentinel', () => {
    assert.equal(detectSentinel('analysis complete'), 'analyze');
    assert.equal(detectSentinel('no critical issues found'), 'analyze');
  });

  test('detects implement sentinel (pr created)', () => {
    assert.equal(detectSentinel('pr created successfully'), 'implement');
  });

  test('detects implement sentinel (pull request URL)', () => {
    assert.equal(detectSentinel('pull request opened'), 'implement');
  });

  test('detects implement sentinel (github.com pull URL)', () => {
    assert.equal(detectSentinel('https://github.com/owner/repo/pull/42'), 'implement');
  });

  test('returns null for unrecognised line', () => {
    assert.equal(detectSentinel('running npm install'), null);
    assert.equal(detectSentinel(''), null);
  });
});

describe('LineBuffer', () => {
  test('accumulates partial chunks and emits complete lines', () => {
    const lines = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push('hello ');
    buf.push('world\nfoo ');
    buf.push('bar\n');
    assert.deepEqual(lines, ['hello world', 'foo bar']);
  });

  test('handles multiple newlines in one chunk', () => {
    const lines = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push('a\nb\nc\n');
    assert.deepEqual(lines, ['a', 'b', 'c']);
  });

  test('does not emit incomplete final line until flush', () => {
    const lines = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push('partial');
    assert.equal(lines.length, 0);
    buf.flush();
    assert.deepEqual(lines, ['partial']);
  });
});

describe('createClaudeProcess', () => {
  test('onExit fires with exit code from mock pty', async () => {
    const mockPty = {
      spawn: (cmd, args, opts) => {
        const handlers = { data: null, exit: null };
        const pty = {
          onData: (cb) => { handlers.data = cb; },
          onExit: (cb) => { handlers.exit = cb; },
          write: () => {},
          kill: () => {},
          _handlers: handlers,
        };
        // Simulate exit after a tick
        setImmediate(() => handlers.exit && handlers.exit({ exitCode: 0 }));
        return pty;
      },
    };

    const spawn = createClaudeProcess(mockPty);
    const proc = spawn('/repos/test', undefined, [], {});

    const exitCode = await new Promise((resolve) => {
      proc.onExit((code) => resolve(code));
    });

    assert.equal(exitCode, 0);
  });

  test('write() calls pty.write', () => {
    let written = null;
    const mockPty = {
      spawn: () => ({
        onData: () => {},
        onExit: () => {},
        write: (text) => { written = text; },
        kill: () => {},
      }),
    };
    const spawn = createClaudeProcess(mockPty);
    const proc = spawn('/repos/test', undefined, [], {});
    proc.write('hello\n');
    assert.equal(written, 'hello\n');
  });

  test('data handler buffers and emits lines', async () => {
    let dataHandler = null;
    const mockPty = {
      spawn: () => {
        const pty = {
          _onDataCb: null,
          onData: (cb) => { pty._onDataCb = cb; dataHandler = cb; },
          onExit: () => {},
          write: () => {},
          kill: () => {},
        };
        return pty;
      },
    };

    const lines = [];
    const spawn = createClaudeProcess(mockPty);
    const proc = spawn('/repos/test', undefined, [], {});
    proc.onData((line) => lines.push(line));

    // Simulate data arriving
    dataHandler('line one\nline ');
    dataHandler('two\n');

    assert.deepEqual(lines, ['line one', 'line two']);
  });
});
