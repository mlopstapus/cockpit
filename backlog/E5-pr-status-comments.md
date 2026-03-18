# E5: PR Status Comments

**Status**: Pending
**Depends on**: E1 (PR context in job), E2 (stage transitions)
**Estimated scope**: New service (~80 LOC) + tests

---

## Goal

Post a GitHub PR comment at each pipeline stage transition, giving the developer
visibility into progress without needing to do anything beyond watching the PR.

---

## What Exists

Nothing directly reusable. The GitHub client pattern is shared with E1/E4.

---

## Files to Create

### `backend/services/pr_commenter.py`

```
PRCommenter
  - github_client: httpx.AsyncClient

  async post_stage_start(job: Job, stage: str)
  async post_stage_complete(job: Job, stage: str, duration_s: float)
  async post_job_complete(job: Job, pr_url: str)
  async post_job_failed(job: Job, reason: str)
```

Comment templates:

| Event | Comment body |
|-------|-------------|
| Stage start | `🔄 **[stage]** started` |
| Stage complete | `✅ **[stage]** complete (Xs)` |
| Job complete | `🚀 Pipeline complete! Branch pushed. [View PR artifacts →](pr_url)` |
| Job failed | `❌ Pipeline failed at **[stage]**: [reason]\n\nCheck Cockpit logs for details.` |

---

## Integration with Pipeline Runner

`pipeline_runner.py` calls `pr_commenter` at each stage boundary:

```python
await pr_commenter.post_stage_start(job, stage.name)
# ... run stage ...
await pr_commenter.post_stage_complete(job, stage.name, elapsed)
```

---

## Rate Limiting

GitHub's API rate limit is 5000 requests/hour for authenticated requests.
With 6 stages × 2 comments each = 12 comments per pipeline run. Not a concern
at any realistic usage level.

To avoid comment spam during development/testing, add a config flag:
```python
pr_comments_enabled: bool = Field(default=True, env="PR_COMMENTS_ENABLED")
```

---

## Security

- GitHub token from env, never logged
- Comment body is static template + job fields — no user-supplied content
  interpolated into PR comments (comment relay acknowledgements are separate)
- `reason` field in failure comment sanitised (strip any PTY control chars)

---

## Tests

`backend/tests/test_pr_commenter.py`

- [ ] `test_stage_start_comment_posted` — POST to GitHub comments API with correct body
- [ ] `test_stage_complete_comment_includes_duration` — elapsed seconds in body
- [ ] `test_job_complete_includes_pr_url` — completion comment contains PR link
- [ ] `test_job_failed_includes_stage_and_reason` — failure comment names failing stage
- [ ] `test_comments_disabled_by_config` — when `PR_COMMENTS_ENABLED=false`, no
  GitHub API calls made
- [ ] `test_control_chars_stripped_from_reason` — ANSI escape codes absent from
  posted failure reason

Use `respx` for GitHub API mocking.

---

## Definition of Done

- [ ] Comment posted on PR at each stage start and completion
- [ ] Completion comment includes elapsed time
- [ ] Failure comment names the stage and includes a sanitised reason
- [ ] `PR_COMMENTS_ENABLED=false` disables all posting (useful for dev/test)
- [ ] All tests pass
