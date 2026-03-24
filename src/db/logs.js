const MAX_LINES = 1000;

export function appendLog(db, jobId, line) {
  db.prepare('INSERT INTO job_logs (job_id, line) VALUES (?, ?)').run(jobId, line);

  // Trim to MAX_LINES: find the seq of the Nth most recent row, delete anything older
  const cutoff = db.prepare(`
    SELECT seq FROM job_logs
    WHERE job_id = ?
    ORDER BY seq DESC
    LIMIT 1 OFFSET ?
  `).get(jobId, MAX_LINES - 1);

  if (cutoff) {
    db.prepare('DELETE FROM job_logs WHERE job_id = ? AND seq < ?').run(jobId, cutoff.seq);
  }
}

export function getLogTail(db, jobId, n = 50) {
  const rows = db.prepare(`
    SELECT line FROM (
      SELECT seq, line FROM job_logs WHERE job_id = ?
      ORDER BY seq DESC LIMIT ?
    ) ORDER BY seq ASC
  `).all(jobId, n);
  return rows.map(r => r.line);
}
