# CLI Contract: `cockpit retry`

**Feature**: 008-cli-retry-command
**Date**: 2026-03-25

## Command Signatures

```
cockpit retry <job-id>
cockpit retry --last
```

## Arguments & Options

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<job-id>` | positional string | one of `<job-id>` or `--last` | ID of the failed job to requeue |
| `--last` | flag | one of `<job-id>` or `--last` | Retry the most recently failed job |

Providing both `<job-id>` and `--last` is a usage error.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Job successfully requeued |
| 1 | Error (job not found, wrong state, no failed jobs, usage error, DB unavailable) |

## Stdout Output

### Success — retry by ID

```
✓ Job <job-id> requeued (resuming from stage: <stage>)
```

### Success — retry --last

```
✓ Job <job-id> requeued (resuming from stage: <stage>)
```

(The `--last` output is identical to the by-ID output; the job ID is always shown.)

## Stderr Output (error cases)

| Scenario | Message |
|----------|---------|
| Job ID not found | `Error: job '<id>' not found` |
| Job not in failed state | `Error: job '<id>' is not in a failed state (current status: <status>)` |
| No failed jobs (`--last`) | `Error: no failed jobs found` |
| Both `<job-id>` and `--last` | `Error: cannot specify both a job ID and --last` |
| DB unavailable | `Error: no database found. Run cockpit init first.` |

## Constraints

- Does **not** require the daemon to be running.
- Does **not** interact with the daemon process; the daemon picks up the re-queued job naturally on its next poll cycle.
- Only jobs with `status = 'failed'` are retryable. All other statuses produce a non-zero exit.
