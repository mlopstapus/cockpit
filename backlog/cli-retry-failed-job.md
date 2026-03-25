Add `cockpit retry <job-id>` CLI command to requeue a failed job without touching the database directly.

Should reset `status → queued`, `stage → idle`, `error → NULL` for the given job ID. Optionally support `cockpit retry --last` to retry the most recently failed job without needing to know the ID.
