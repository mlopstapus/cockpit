# Contract: POST_IMPLEMENT_COMMAND Hook

## Configuration

Set in `.env`:
```
POST_IMPLEMENT_COMMAND=systemctl --user restart my-app
```

Or left empty/unset to disable.

## Execution Contract

- **When**: After every successful `implement` pipeline stage
- **How**: `/bin/sh -c "<POST_IMPLEMENT_COMMAND>"`
- **CWD**: The target repo's local path (`job.repo_path`)
- **Environment**: Inherits the Cockpit process environment (all `.env` vars available)
- **Timeout**: 30 seconds (non-configurable; commands expected to be fast restart/reload operations)

## Outcome Reporting

| Outcome | GitHub Comment |
|---------|---------------|
| Exit 0 | "✅ Post-implement hook ran successfully." |
| Exit non-zero | "⚠️ Post-implement hook failed (exit `<code>`): `<first 200 chars of stderr>`" |
| Not set | No comment posted |
| Timeout | "⚠️ Post-implement hook timed out after 30s." |

Pipeline completion status is **not affected** by hook outcome — pipeline always marks complete after implement succeeds, regardless of hook result.

## Replaces

`EXPO_RESTART_ENABLED` env var and `_restart_expo()` method in `pipeline_runner.py`.

**Migration for existing Expo users**:
```
# Old .env
EXPO_RESTART_ENABLED=true

# New .env
POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo
```
