export function enqueuePrReview(db, review) {
  db.prepare(`
    INSERT OR IGNORE INTO pr_review_jobs
      (id, github_repo, pr_number, issue_number, repo_path, comment_id, comment_body, pr_url, status, created_at)
    VALUES
      (@id, @github_repo, @pr_number, @issue_number, @repo_path, @comment_id, @comment_body, @pr_url, @status, @created_at)
  `).run(review);
}

export function dequeuePrReview(db) {
  const dequeue = db.transaction(() => {
    const row = db.prepare(
      "SELECT * FROM pr_review_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
    ).get();
    if (!row) return null;
    db.prepare(
      "UPDATE pr_review_jobs SET status = 'active' WHERE id = ?"
    ).run(row.id);
    return { ...row, status: 'active' };
  });
  return dequeue();
}

export function markPrReviewComplete(db, id) {
  db.prepare(
    "UPDATE pr_review_jobs SET status = 'completed' WHERE id = ?"
  ).run(id);
}

export function resetPrReviewToQueued(db, id) {
  db.prepare(
    "UPDATE pr_review_jobs SET status = 'queued' WHERE id = ?"
  ).run(id);
}

export function requeueInterruptedPrReviews(db) {
  const result = db.prepare(
    "UPDATE pr_review_jobs SET status = 'queued' WHERE status = 'active'"
  ).run();
  return result.changes;
}
