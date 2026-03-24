import pty from 'node-pty';

// ─── Sentinel detection ───────────────────────────────────────────────────────

const SENTINELS = [
  { stage: 'specify',   patterns: [/spec\.md written/i, /specification complete/i] },
  { stage: 'clarify',   patterns: [/no clarification needed/i, /clarifications recorded/i] },
  { stage: 'plan',      patterns: [/plan\.md written/i, /plan complete/i] },
  { stage: 'tasks',     patterns: [/tasks\.md written/i] },
  { stage: 'analyze',   patterns: [/analysis complete/i, /no critical/i] },
  { stage: 'implement', patterns: [/pr created/i, /pull request/i, /github\.com\/[^/]+\/[^/]+\/pull/i] },
];

export function detectSentinel(line) {
  if (!line) return null;
  for (const { stage, patterns } of SENTINELS) {
    if (patterns.some(p => p.test(line))) return stage;
  }
  return null;
}

const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

export function extractPrUrl(line) {
  const m = line.match(PR_URL_PATTERN);
  return m ? m[0] : null;
}

// ─── Line buffer ─────────────────────────────────────────────────────────────

export class LineBuffer {
  constructor(onLine) {
    this._buf = '';
    this._onLine = onLine;
  }

  push(chunk) {
    this._buf += chunk;
    const parts = this._buf.split('\n');
    this._buf = parts.pop(); // keep last incomplete part
    for (const line of parts) {
      this._onLine(line);
    }
  }

  flush() {
    if (this._buf) {
      this._onLine(this._buf);
      this._buf = '';
    }
  }
}

// ─── Claude process factory ───────────────────────────────────────────────────

export function createClaudeProcess(ptyModule = pty) {
  return function spawnClaude(repoPath, configDir, extraArgs = [], opts = {}) {
    const args = ['--dangerously-skip-permissions', ...extraArgs];
    if (configDir) args.unshift('--config', configDir);

    const ptyProcess = ptyModule.spawn('claude', args, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      cwd: repoPath,
      env: { ...process.env },
    });

    let dataCallback = null;
    let exitCallback = null;
    let killTimer = null;
    let killed = false;

    const lineBuf = new LineBuffer((line) => {
      if (dataCallback) dataCallback(line);
    });

    ptyProcess.onData((chunk) => {
      lineBuf.push(chunk);
    });

    ptyProcess.onExit(({ exitCode }) => {
      lineBuf.flush();
      if (killTimer) clearTimeout(killTimer);
      if (exitCallback) exitCallback(exitCode);
    });

    // Timeout handling
    if (opts.timeoutMs) {
      const timeoutHandle = setTimeout(() => {
        if (!killed) {
          killed = true;
          ptyProcess.kill('SIGTERM');
          killTimer = setTimeout(() => {
            try { ptyProcess.kill('SIGKILL'); } catch {}
          }, 5000);
        }
      }, opts.timeoutMs);
      // Store for cleanup
      ptyProcess._timeoutHandle = timeoutHandle;
    }

    return {
      onData(cb) { dataCallback = cb; },
      onExit(cb) { exitCallback = cb; },
      write(text) { ptyProcess.write(text); },
      kill(signal = 'SIGTERM') {
        if (killed) return;
        killed = true;
        if (ptyProcess._timeoutHandle) clearTimeout(ptyProcess._timeoutHandle);
        ptyProcess.kill(signal);
        killTimer = setTimeout(() => {
          try { ptyProcess.kill('SIGKILL'); } catch {}
        }, 5000);
      },
    };
  };
}

// Default export — uses real node-pty
export const spawnClaude = createClaudeProcess(pty);
