import { execSync } from 'node:child_process';
import { getLogTail } from '../db/logs.js';
import { getJob } from '../db/jobs.js';

// Returns lines array or null if job not found
export function getJobLogs(db, jobId, n = 50) {
  const job = getJob(db, jobId);
  if (!job) return null;
  return getLogTail(db, jobId, n);
}

export function showLogs(db, jobId, opts = {}) {
  const n = opts.n || 50;

  if (jobId) {
    const lines = getJobLogs(db, jobId, n);
    if (lines === null) {
      console.error(`Job not found: ${jobId}`);
      process.exit(1);
    }
    for (const line of lines) console.log(line);

    if (opts.follow) {
      let lastCount = lines.length;
      setInterval(() => {
        const updated = getJobLogs(db, jobId, 9999);
        if (updated && updated.length > lastCount) {
          for (const line of updated.slice(lastCount)) console.log(line);
          lastCount = updated.length;
        }
      }, 1000);
    }
    return;
  }

  // No job-id: read from system logs
  if (process.platform === 'linux') {
    try {
      const out = execSync(
        `journalctl --user -u cockpit-daemon -n ${n} --no-pager 2>/dev/null`,
        { stdio: 'pipe' }
      ).toString();
      process.stdout.write(out);
    } catch {
      console.error('journalctl not available or daemon not installed as a service.');
    }
  } else if (process.platform === 'darwin') {
    const logFile = `${process.env.HOME}/Library/Logs/cockpit-daemon.log`;
    try {
      const out = execSync(`tail -n ${n} "${logFile}" 2>/dev/null`, { stdio: 'pipe' }).toString();
      process.stdout.write(out);
    } catch {
      console.error(`Log file not found: ${logFile}`);
    }
  }
}
