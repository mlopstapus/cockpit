# E3: Log Buffer & Diagnostic Stream

**Status**: Pending
**Depends on**: E2 (active pipeline to produce logs)
**Estimated scope**: Adapt existing hub (~30 LOC changes) + update route + tests

---

## Goal

Persist all PTY output to Redis (log buffer) and expose a diagnostic WebSocket
endpoint for internal monitoring. This is **not** for an end-user frontend —
GitHub PR comments are the developer's interface. The WebSocket is for debugging
Cockpit itself (e.g. from a laptop terminal via `wscat`).

---

## What Exists (Reuse)

- `backend/ws/hub.py` — fan-out broadcast hub. Rename internal key from
  `session_id` → `job_id`. No other changes needed.
- The `WS /ws/accounts/{id}/auth` endpoint (auth stream) is already working and
  stays as-is.

---

## Changes Required

### `backend/ws/hub.py`

- Rename `session_id` → `job_id` in all internal references
- Add `get_subscriber_count(job_id: str) → int` (useful for detecting when to
  stop broadcasting after job completes)

### `backend/main.py` — new WebSocket route

```python
@app.websocket("/ws/jobs/{job_id}")
async def job_log_stream(websocket: WebSocket, job_id: str):
    job = await job_store.get(job_id)
    if not job:
        await websocket.close(code=4004)
        return

    # Send catch-up buffer (last 200 lines)
    for line in await job_store.get_log_tail(job_id, 200):
        await websocket.send_text(line)

    # Subscribe to live broadcast
    async with hub.subscribe(job_id) as queue:
        while True:
            line = await queue.get()
            if line is None:  # job ended sentinel
                break
            await websocket.send_text(line)
```

### Message format (plain text, not JSON)

Log lines are sent as raw text (one PTY line per message). This keeps it usable
with simple tools (`wscat`, `websocat`) without a JSON parser.

Stage transition events are sent as a prefixed annotation:
```
[STAGE] plan
[STAGE_DONE] specify (42s)
[JOB_COMPLETE] https://github.com/mlopstapus/seamless/pull/12
[JOB_FAILED] implement: PTY exited with code 1
```

---

## Log Buffer in Redis (via JobStore)

`job_store.append_log(job_id, line)` does:
```redis
RPUSH job:{id}:logs {line}
LTRIM job:{id}:logs -1000 0   # keep last 1000 lines
```

`job_store.get_log_tail(job_id, n)` does:
```redis
LRANGE job:{id}:logs -N -1
```

This is the same buffer E3 reads for the catch-up on WebSocket connect.

---

## Security

- Endpoint accessible only on Tailscale interface (Caddy config)
- No authentication beyond Tailscale network access
- Log lines forwarded verbatim — do not expose secrets in PTY output
  (account rotator and pipeline runner must scrub before append_log if needed)

---

## Tests

`backend/tests/test_websocket_streaming.py`

- [ ] `test_catchup_buffer_on_connect` — existing log lines sent immediately on connect
- [ ] `test_live_lines_forwarded` — lines appended mid-connection arrive at client
- [ ] `test_stage_annotation_emitted` — stage change produces `[STAGE]` prefix line
- [ ] `test_job_complete_annotation` — job completion closes stream with `[JOB_COMPLETE]`
- [ ] `test_unknown_job_id_closes_4004` — invalid job_id → websocket close 4004
- [ ] `test_multi_client` — two concurrent clients both receive same lines

Use `pytest-asyncio`, FastAPI test WebSocket client, `fakeredis`.

---

## Definition of Done

- [ ] `WS /ws/jobs/{job_id}` sends catch-up buffer then live lines
- [ ] Stage transition and job terminal annotations emitted
- [ ] Multiple simultaneous connections work
- [ ] Invalid job_id closed with code 4004
- [ ] All tests pass
