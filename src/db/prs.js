export function registerActivePr(db, pr) {
  db.prepare(`
    INSERT OR IGNORE INTO active_prs
      (github_repo, pr_number, job_id, issue_number, repo_path, registered_at)
    VALUES
      (@github_repo, @pr_number, @job_id, @issue_number, @repo_path, @registered_at)
  `).run(pr);
}

export function listActivePrs(db) {
  return db.prepare('SELECT * FROM active_prs ORDER BY registered_at DESC').all();
}

export function getActivePr(db, repo, prNumber) {
  return db.prepare(
    'SELECT * FROM active_prs WHERE github_repo = ? AND pr_number = ?'
  ).get(repo, prNumber) ?? null;
}

export function deregisterPr(db, repo, prNumber) {
  db.prepare(
    'DELETE FROM active_prs WHERE github_repo = ? AND pr_number = ?'
  ).run(repo, prNumber);
}

export function isPrCommentSeen(db, repo, prNumber, commentId) {
  const row = db.prepare(
    'SELECT 1 FROM seen_pr_comments WHERE github_repo = ? AND pr_number = ? AND comment_id = ?'
  ).get(repo, prNumber, commentId);
  return row !== undefined;
}

export function markPrCommentSeen(db, repo, prNumber, commentId) {
  db.prepare(
    'INSERT OR IGNORE INTO seen_pr_comments (github_repo, pr_number, comment_id) VALUES (?, ?, ?)'
  ).run(repo, prNumber, commentId);
}
