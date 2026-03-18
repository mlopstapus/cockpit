# E4: PR Comment Relay (Clarify Q&A + Steering)

**Status**: Pending
**Depends on**: E2 (pipeline runner must hand off during clarify stage)
**Estimated scope**: New service (~150 LOC) + tests

---

## Goal

Two responsibilities:

1. **Clarify Q&A**: When the pipeline runner pauses at the `clarify` stage,
   detect the questions in PTY output, post them as a PR comment, poll for the
   developer's answer, inject the answer back into the PTY, and resume the pipeline.

2. **Ad hoc steering**: At any stage, the developer can leave a PR comment to
   steer Claude. Detected owner comments are injected into the active PTY with
   an acknowledgement reply.

---

## What Exists

Nothing reusable. Net new service.

---

## Clarify Q&A Flow (Primary Use Case)

```
[Pipeline Runner] runs /speckit.clarify
       │
       ▼ Claude outputs questions (detected by sentinel)
[Pipeline Runner] sets job.status = "awaiting_clarification"
       │
       ▼
[Comment Relay] detects status change
       │ formats questions from PTY output buffer
       │ posts single PR comment: "❓ Clarification needed:\n1. ...\n2. ..."
       ▼
Developer reads PR comment on GitHub mobile, replies with answers
       │
[Comment Relay] polls PR, detects owner reply comment
       │ injects answers into PTY stdin
       │ sets job.status = "running"
       │ posts ack reply: "✅ Got it — continuing"
       ▼
[Pipeline Runner] resumes reading PTY output, Claude continues with context
```

---

## Question Detection

`speckit.clarify` outputs questions in a recognisable format. The comment relay
watches for these patterns in the PTY output buffer during the clarify stage:

- Lines matching `^\d+\.\s` (numbered list items) after a question header
- Or a configurable sentinel like `CLARIFY_QUESTIONS_START` / `CLARIFY_QUESTIONS_END`

The exact detection pattern must be validated against `speckit.clarify` actual output
during integration testing against `mlopstapus/seamless`.

---

## Files to Create

### `backend/services/comment_relay.py`

```python
class CommentRelay:
    job_store: JobStore
    github_client: httpx.AsyncClient
    pipeline_runner: PipelineRunner  # reference to inject into active PTY

    async def start_for_job(job_id: str, pr: PRContext)
      # runs poll loop for the duration of the job

    async def stop_for_job(job_id: str)

    # ── Clarify Q&A ──────────────────────────────────────────────────
    async def _post_clarify_questions(job: Job, questions: list[str])
      # formats numbered list, posts as PR comment
      # stores question_comment_id in Redis

    async def _poll_for_clarify_answer(job_id: str, pr: PRContext) → str | None
      # polls for owner reply after question_comment_id posted
      # returns answer text or None on timeout (24h default)

    async def _inject_answer(job_id: str, answer: str)
      # sanitise answer, write to ClaudeProcess PTY stdin
      # set job.status = "running"
      # post ack comment

    # ── Ad hoc steering ──────────────────────────────────────────────
    async def _poll_steering_comments(job_id: str, pr: PRContext)
      # polls for any new owner comments that are NOT clarify answers
      # injects into PTY, posts ack

    # ── Shared ───────────────────────────────────────────────────────
    async def _is_owner_comment(comment: dict) → bool
    async def _already_seen(job_id: str, comment_id: int) → bool
    async def _mark_seen(job_id: str, comment_id: int)
    async def _post_ack(pr: PRContext, thread_comment_id: int, body: str)
```

### State in Redis

```
job:{id}:seen_comments     — set of comment IDs already processed
job:{id}:question_cid      — comment ID of the posted clarify question (to thread replies)
```

---

## Comment Safety Rules

- **Author filter**: Only comments from `GITHUB_OWNER` are relayed (not other contributors)
- **Bot loop prevention**: The `✅ Got it — continuing` ack comment is posted by the
  same token. Filter by checking if `comment.user.login == GITHUB_OWNER` (bot user
  would be different, but add a content filter for `"✅"` prefix as belt-and-suspenders)
- **Clarify vs. steering**: During `awaiting_clarification` status, the first owner
  reply after the question comment is treated as the answer. Outside that status,
  owner comments are ad hoc steering injections.
- **Sanitisation**: Strip HTML tags, limit to 4000 chars, no further filtering
  (owner is trusted per constitution Principle I)

---

## Security

- Only `GITHUB_OWNER`-authored comments relayed (not public contributors)
- Answer/steering text sanitised (HTML stripped, length capped)
- Seen comment IDs in Redis prevent replay on next poll cycle
- `GITHUB_TOKEN` never logged
- `_post_ack` replies are threaded on the specific question comment to keep
  PR thread readable

---

## Tests

`backend/tests/test_comment_relay.py`

- [ ] `test_clarify_questions_posted_as_pr_comment` — questions extracted from PTY
  buffer → single numbered-list comment posted to PR
- [ ] `test_clarify_answer_injected` — owner reply comment after question → injected
  into PTY, job.status = "running"
- [ ] `test_clarify_ack_posted` — after answer injection, `✅ Got it` reply posted
- [ ] `test_clarify_timeout_proceeds` — no answer in 24h → None returned, pipeline
  continues with assumptions note
- [ ] `test_steering_comment_injected` — owner comment during non-clarify stage →
  injected into PTY
- [ ] `test_steering_ack_posted` — steering injection → `✅ Received — addressing now`
- [ ] `test_non_owner_comment_ignored` — PR comment from other user not injected
- [ ] `test_seen_comment_not_reprocessed` — same comment_id not relayed twice
- [ ] `test_ack_comment_not_self_relayed` — `✅` prefix filtered from relay

Use `pytest-asyncio`, `respx`, `fakeredis`.

---

## Definition of Done

- [ ] Clarify questions posted as PR comment when pipeline enters `awaiting_clarification`
- [ ] Developer answer (owner PR comment) injected into PTY within one poll cycle
- [ ] Job status flips `awaiting_clarification` → `running` on answer injection
- [ ] Ack comment posted after each injection
- [ ] Ad hoc steering works at any active stage
- [ ] 24h timeout proceeds without crashing
- [ ] All tests pass
- [ ] Non-owner comments silently ignored
