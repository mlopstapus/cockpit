# E8: Webhook Migration (Polling → GitHub Webhooks via Tailscale Funnel)

**Status**: Pending (polish/reliability — do last)
**Depends on**: E1–E6 stable
**Estimated scope**: New webhook handler (~100 LOC) + Tailscale Funnel setup + tests

---

## Goal

Replace the GitHub PR polling loop (E1) with real-time GitHub webhooks delivered
via Tailscale Funnel. This eliminates polling latency and reduces GitHub API usage.

---

## Why Last

Polling works. Webhooks require:
1. Tailscale Funnel configured and stable on the NUC
2. GitHub webhook registered on target repos
3. Webhook signature verification

Deliver full value with polling first; migrate when the core loop is proven.

---

## Tailscale Funnel

Funnel provides a public HTTPS endpoint (e.g. `https://nuc.tailnet.ts.net/`)
that forwards to a local port on the NUC without opening firewall ports.

```bash
# Enable Funnel to port 8001
tailscale funnel 8001
```

GitHub receives `https://nuc.tailnet.ts.net/webhooks/github` as the webhook URL.

---

## Files to Create

### `backend/routers/webhooks.py`

```python
POST /webhooks/github
  - Verify X-Hub-Signature-256 HMAC (using GITHUB_WEBHOOK_SECRET)
  - Parse event type: only handle "pull_request"
  - On action "opened" or "reopened", title starts with "[COCKPIT]":
      await job_store.enqueue(job_from_pr(payload))
  - On action "closed": mark any active job for that PR as cancelled
  - Return 200 immediately (GitHub requires fast response)
```

### HMAC Verification

```python
def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Reject with HTTP 401 if signature invalid.

---

## Coexistence with Polling

Run both during migration. Add a config flag:

```python
github_trigger: Literal["poll", "webhook", "both"] = Field(
    default="both", env="GITHUB_TRIGGER"
)
```

`"both"` — GithubWatcher runs (catches misses) + webhooks handle real-time.
`"webhook"` — polling disabled once Funnel is confirmed stable.

The job deduplication in `job_store.enqueue` (skip if already queued) prevents
double-processing regardless of which path creates the job.

---

## Config

```python
github_webhook_secret: str = Field(default="", env="GITHUB_WEBHOOK_SECRET")
```

If empty, webhook endpoint returns 503 (not configured).

---

## Security

- HMAC-SHA256 signature verification is MANDATORY — reject unsigned requests
- `GITHUB_WEBHOOK_SECRET` from env, never logged
- Constant-time comparison (`hmac.compare_digest`) prevents timing attacks
- Webhook endpoint accessible via Tailscale Funnel public URL — must verify
  signature on every request (public URL = reachable by anyone)
- Payload size limited to 10MB (GitHub's max is ~25MB; our guard is conservative)

---

## Tests

`backend/tests/test_webhooks.py`

- [ ] `test_valid_signature_accepted` — correct HMAC → 200
- [ ] `test_invalid_signature_rejected` — wrong HMAC → 401
- [ ] `test_missing_signature_rejected` — no header → 401
- [ ] `test_cockpit_pr_opened_enqueued` — `[COCKPIT]` PR opened → job enqueued
- [ ] `test_pr_opened_non_spec_branch_ignored` — main PR → no job
- [ ] `test_pr_closed_cancels_active_job` — closed event → job cancelled
- [ ] `test_duplicate_ignored_by_job_store` — webhook fires twice → one job only
- [ ] `test_signature_not_logged_on_failure` — assert header value absent from logs

---

## Definition of Done

- [ ] Tailscale Funnel forwards `https://<nuc>.ts.net/webhooks/github` to port 8001
- [ ] GitHub webhook registered on all `GITHUB_REPOS` repos
- [ ] HMAC signature verified on every request
- [ ] Spec PR opened → job enqueued within 1–2 seconds (vs. 30s poll latency)
- [ ] `GITHUB_TRIGGER=webhook` disables polling loop
- [ ] All tests pass
- [ ] Webhook secret not present in any log output
