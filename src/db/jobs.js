import crypto from 'node:crypto';

export function makeJobId() {
  return crypto.randomBytes(4).toString('hex');
}

export function enqueueJob(db, job) {
  // INSERT OR IGNORE; if a row already exists for (repo, issue_number), return that row's id
  db.prepare(`
    INSERT OR IGNORE INTO jobs
      (id, github_repo, issue_number, issue_title, issue_body, spec_name, repo_path,
       stage, status, created_at, updated_at)
    VALUES
      (@id, @github_repo, @issue_number, @issue_title, @issue_body, @spec_name, @repo_path,
       @stage, @status, @created_at, @updated_at)
  `).run(job);

  const existing = db.prepare(
    'SELECT id FROM jobs WHERE github_repo = ? AND issue_number = ?'
  ).get(job.github_repo, job.issue_number);

  return existing.id;
}

export function dequeueJob(db) {
  const dequeue = db.transaction(() => {
    const row = db.prepare(
      "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
    ).get();
    if (!row) return null;
    db.prepare(
      "UPDATE jobs SET status = 'active', updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), row.id);
    return { ...row, status: 'active' };
  });
  return dequeue();
}

export function markActive(db, id) {
  db.prepare(
    "UPDATE jobs SET status = 'active', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

export function markStage(db, id, stage) {
  db.prepare(
    "UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ?"
  ).run(stage, new Date().toISOString(), id);
}

export function markRateLimited(db, id, resetAt, newCount) {
  db.prepare(`
    UPDATE jobs
    SET status = 'rate_limited',
        rate_limit_reset_at = ?,
        rate_limit_count = ?,
        updated_at = ?
    WHERE id = ?
  `).run(resetAt ?? null, newCount, new Date().toISOString(), id);
}

export function requeueExpiredRateLimited(db) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'queued',
        rate_limit_reset_at = NULL,
        updated_at = ?
    WHERE status = 'rate_limited'
      AND (rate_limit_reset_at IS NULL OR rate_limit_reset_at <= ?)
  `).run(now, now);
  return result.changes;
}

export function listRateLimited(db) {
  return db.prepare(
    "SELECT * FROM jobs WHERE status = 'rate_limited' ORDER BY updated_at DESC"
  ).all();
}

export function requeueInterrupted(db) {
  db.prepare(`
    UPDATE jobs
    SET status = 'queued',
        updated_at = ?
    WHERE status = 'active'
  `).run(new Date().toISOString());
}

export function markComplete(db, id) {
  db.prepare(
    "UPDATE jobs SET status = 'completed', stage = 'done', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

export function markFailed(db, id, error) {
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?"
  ).run(error ?? null, new Date().toISOString(), id);
}

export function markCancelled(db, id) {
  db.prepare(
    "UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

export function getJob(db, id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) ?? null;
}

export function listActive(db) {
  return db.prepare("SELECT * FROM jobs WHERE status = 'active' ORDER BY updated_at DESC").all();
}

export function listRecent(db, n = 20) {
  return db.prepare(
    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?"
  ).all(n);
}
