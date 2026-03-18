# E2: Pipeline Runner

**Status**: Pending
**Depends on**: E1 (job in Redis queue)
**Blocks**: E4 (clarify relay needs active pipeline), E5 (status comments need stage transitions)
**Estimated scope**: New service (~250 LOC) + tests

---

## Goal

Dequeue jobs from Redis, `cd` into the target repo, spawn a Claude Code session
with `--dangerously-skip-permissions`, and run the six spec-kit stages sequentially.
Update job state at each transition. One job at a time.

The spec-kit commands and constitution used are those of the **target repo**
(e.g. `mlopstapus/seamless`) — never Cockpit's own.

---

## What Exists (Reuse)

- `backend/services/claude_process.py` — PTY-based Claude CLI wrapper. Keep as-is.
  The runner drives it via stdin commands and reads stdout.

---

## What Changes

`backend/services/session_manager.py` is replaced by `pipeline_runner.py`.

---

## Pipeline Stages

```
specify → clarify → plan → tasks → analyze → implement
```

| Stage | Command | Blocks on |
|-------|---------|-----------|
| specify | `/speckit.specify {spec_name}: {pr_body}` | sentinel in output |
| clarify | `/speckit.clarify` | dev answers via PR comment (E4) |
| plan | `/speckit.plan` | sentinel in output |
| tasks | `/speckit.tasks` | sentinel in output |
| analyze | `/speckit.analyze` | sentinel in output |
| implement | `/speckit.implement` | sentinel in output |

No `constitution` stage — the target repo already has its constitution.
The pipeline references it automatically because Claude runs inside that repo.

---

## Files to Create

### `backend/services/pipeline_runner.py`

```python
STAGES = [
    Stage("specify",   "/speckit.specify {spec_name}: {pr_body}"),
    Stage("clarify",   "/speckit.clarify"),          # blocks until E4 injects answers
    Stage("plan",      "/speckit.plan"),
    Stage("tasks",     "/speckit.tasks"),
    Stage("analyze",   "/speckit.analyze"),
    Stage("implement", "/speckit.implement"),
]

class PipelineRunner:
    async def start()     # dequeue loop as background task
    async def stop()

    async def _run_job(job: Job):
        working_dir = config.repo_local_paths[job.github_repo]
        # validate: is a git repo, is on correct branch

        process = ClaudeProcess(
            cwd=working_dir,
            extra_flags=["--dangerously-skip-permissions"],
        )
        await process.start()

        for stage in STAGES:
            await job_store.update(job.id, stage=stage.name, status="running")
            await pr_commenter.post_stage_start(job, stage.name)

            cmd = stage.command.format(
                spec_name=job.spec_name,
                pr_body=job.pr_body,
            )
            await process.send(cmd)

            async for line in process.output_lines():
                await job_store.append_log(job.id, line)
                hub.broadcast(job.id, line)

                if account_rotator.detect_rate_limit(line):
                    await _handle_rate_limit(job, process, stage)
                    break

                if _is_clarify_question(line) and stage.name == "clarify":
                    await job_store.update(job.id, status="awaiting_clarification")
                    # E4 (CommentRelay) takes over; pipeline_runner suspends output
                    # reading until job status returns to "running"
                    await _wait_for_clarification(job.id)
                    break

                if _stage_complete(stage, line):
                    await pr_commenter.post_stage_complete(job, stage.name)
                    break

        await job_store.mark_complete(job.id)
        await pr_commenter.post_job_complete(job)
```

### Stage completion sentinels

Detected by scanning PTY output lines:

| Stage | Sentinel pattern |
|-------|----------------|
| specify | `spec.md` written / `✓ Spec` in output |
| clarify | `clarify complete` / questions list ends |
| plan | `plan.md` written / `✓ Plan` |
| tasks | `tasks.md` written / `✓ Tasks` |
| analyze | `✓ Analysis` / analysis complete marker |
| implement | PR URL in output (e.g. `https://github.com/`) or `✓ Implementation` |

These must be validated against actual spec-kit output and adjusted during E2
integration testing. Exact sentinel strings to be confirmed by running spec-kit
manually against `mlopstapus/seamless`.

---

## Key Behaviours

### Working Directory

`ClaudeProcess` spawns with `cwd=working_dir` (the target repo path).
Claude runs inside the target repo — it reads that repo's `.specify/`, uses its
constitution, and writes spec artifacts into it.

### `--dangerously-skip-permissions`

Passed to `claude` CLI on session spawn. Required for `speckit.implement` to
write files and run commands without interactive permission prompts.

### Clarify Pause

When the clarify stage is detected as asking questions:
1. Runner sets job status to `awaiting_clarification`
2. Runner suspends (waits on `job_store.status == "running"` polling or asyncio event)
3. E4 (CommentRelay) posts questions to PR, polls for answer, injects it
4. E4 sets job status back to `running`
5. Runner resumes reading PTY output

### Error Handling

- PTY process exits non-zero → `mark_failed(job, "PTY exit {code}")`
- Stage timeout (configurable, default 30 min) → `mark_failed(job, "timeout at {stage}")`
- Clarify timeout (default 24h) → proceed with note: "No answer received — proceeding with assumptions"
- All failures post a PR comment via E5

---

## Files to Modify

### `backend/services/claude_process.py`

Add `extra_flags: list[str]` parameter to `__init__` / spawn method so the
runner can pass `--dangerously-skip-permissions` without hard-coding it.

### `backend/main.py`

Replace `session_manager` startup with `pipeline_runner` startup.

### `backend/routers/` → `backend/routers/jobs.py`

New job-centric router replaces sessions/projects/workspaces routers.

---

## Security

- `--dangerously-skip-permissions` is intentional and documented — Claude runs
  in the target repo with full file access, which is required for spec-kit
- Working directory validated to be a git repo before spawning
- Only jobs from the Redis queue (E1-filtered) reach the runner
- Stage commands are from a fixed enum — no user-supplied command strings reach PTY

---

## Tests

`backend/tests/test_pipeline_runner.py`

- [ ] `test_stages_execute_in_order` — mock PTY; assert specify → clarify → plan →
  tasks → analyze → implement sequence
- [ ] `test_stage_status_updated_in_redis` — after each sentinel, job.stage field correct
- [ ] `test_job_complete_on_final_sentinel` — implement sentinel → job marked complete
- [ ] `test_job_fails_on_pty_error` — PTY exit non-zero → job.status = failed
- [ ] `test_stage_timeout_marks_failed` — stage running > 30min → mark_failed
- [ ] `test_clarify_pause_resumes_on_answer` — clarify questions detected → status
  `awaiting_clarification`; after simulated answer inject → status `running`, runner continues
- [ ] `test_rate_limit_pauses_and_rotates` — rate limit signal mid-stage → account rotator called
- [ ] `test_working_dir_validated` — non-git path → ValueError before spawn
- [ ] `test_dangerously_skip_permissions_flag_passed` — assert flag present in ClaudeProcess args
- [ ] `test_log_lines_in_job_store` — PTY lines appear in get_log_tail

Use `pytest-asyncio`, mock `ClaudeProcess` with `AsyncMock` PTY output.

---

## Definition of Done

- [ ] Pipeline `cd`s into target repo and runs all six stages sequentially
- [ ] Job `stage` and `status` fields in Redis reflect current state in real time
- [ ] Clarify stage suspends and resumes correctly via job status handoff with E4
- [ ] Rate limit signal triggers account rotator (E6 integration)
- [ ] Stage timeouts handled gracefully
- [ ] All tests pass
- [ ] `--dangerously-skip-permissions` flag passed on session spawn
