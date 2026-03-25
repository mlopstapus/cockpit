import Database from 'better-sqlite3';

export function openDb(dbPath) {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id                   TEXT PRIMARY KEY,
      github_repo          TEXT NOT NULL,
      issue_number         INTEGER NOT NULL,
      issue_title          TEXT NOT NULL,
      issue_body           TEXT,
      spec_name            TEXT NOT NULL,
      repo_path            TEXT NOT NULL,
      stage                TEXT NOT NULL DEFAULT 'idle',
      status               TEXT NOT NULL DEFAULT 'queued',
      error                TEXT,
      pr_url               TEXT,
      rate_limit_reset_at  TEXT,
      rate_limit_count     INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      UNIQUE(github_repo, issue_number)
    );

    CREATE TABLE IF NOT EXISTS job_logs (
      seq    INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      line   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seen_comments (
      job_id     TEXT    NOT NULL,
      comment_id INTEGER NOT NULL,
      UNIQUE(job_id, comment_id)
    );

    CREATE TABLE IF NOT EXISTS active_prs (
      github_repo   TEXT    NOT NULL,
      pr_number     INTEGER NOT NULL,
      job_id        TEXT    NOT NULL REFERENCES jobs(id),
      issue_number  INTEGER NOT NULL,
      repo_path     TEXT    NOT NULL,
      registered_at TEXT    NOT NULL,
      UNIQUE(github_repo, pr_number)
    );

    CREATE TABLE IF NOT EXISTS seen_pr_comments (
      github_repo TEXT NOT NULL,
      pr_number   INTEGER NOT NULL,
      comment_id  TEXT NOT NULL,
      UNIQUE(github_repo, pr_number, comment_id)
    );

    CREATE TABLE IF NOT EXISTS pr_review_jobs (
      id           TEXT PRIMARY KEY,
      github_repo  TEXT NOT NULL,
      pr_number    INTEGER NOT NULL,
      issue_number INTEGER NOT NULL,
      repo_path    TEXT NOT NULL,
      comment_id   TEXT NOT NULL,
      comment_body TEXT NOT NULL,
      pr_url       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      created_at   TEXT NOT NULL
    );
  `);

  // Migrate existing installs: add rate-limit columns if not already present.
  // ALTER TABLE ADD COLUMN throws if the column exists — catch and ignore.
  try { db.exec(`ALTER TABLE jobs ADD COLUMN rate_limit_reset_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE jobs ADD COLUMN rate_limit_count INTEGER NOT NULL DEFAULT 0`); } catch {}

  return db;
}
