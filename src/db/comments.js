export function isCommentSeen(db, jobId, commentId) {
  const row = db.prepare(
    'SELECT 1 FROM seen_comments WHERE job_id = ? AND comment_id = ?'
  ).get(jobId, commentId);
  return row !== undefined;
}

export function markCommentSeen(db, jobId, commentId) {
  db.prepare(
    'INSERT OR IGNORE INTO seen_comments (job_id, comment_id) VALUES (?, ?)'
  ).run(jobId, commentId);
}
