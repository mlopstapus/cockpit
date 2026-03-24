# Contract: Setup CLI (`setup/index.js`)

## Invocation

```bash
node setup/index.js [options]
```

Or via package.json convenience script:
```bash
npm run setup
```

## Options / Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--yes` / `-y` | Non-interactive mode; accept all defaults | false |
| `--target <path>` | Target repo path (skip prompt) | none |
| `--help` / `-h` | Print usage and exit | — |

## Interactive Phases

### Phase 1: Cockpit Configuration
Prompts collected (in order):

1. `GitHub Personal Access Token` — text, required, masked
2. `GitHub owner/org` — text, required
3. `GitHub repos to watch (comma-separated)` — text, required, e.g. `owner/repo1,owner/repo2`
4. `Local path for each repo` — for each repo collected in (3), one path prompt
5. `Post-implement command (optional)` — text, optional; hint: "e.g. systemctl --user restart my-app"
6. `Database path` — text, default `~/.cockpit/cockpit.db`

### Phase 2: Service File Generation
- Auto-detect OS (`process.platform`)
- Linux: generate `cockpit-api@<username>.service` (systemd unit)
- macOS: generate `com.cockpit.api.plist` (launchd plist)
- Print copy/load instructions to stdout

### Phase 3: Spec-kit Install
- Check if `uv` is on PATH (exit code 2 with install instructions if missing)
- Prompt: `Install specify-cli (spec-kit)? [Y/n]`
- On yes: run `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`
- On success: print "✅ specify-cli installed. Run `specify check` to verify."
- On failure: print error and continue (non-fatal)

### Phase 4: Next Steps (printed, not executed)
After Phase 3 completes, print instructions:
```
Next steps for your target repo (<targetRepo>):

  1. cd <targetRepo>
  2. specify init --here --ai claude
  3. Open Claude Code in <targetRepo> and run: /speckit.constitution

Then return here and start Cockpit:
  sudo systemctl enable --now cockpit-api@<username>   (Linux)
  launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist  (macOS)
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Setup completed successfully |
| 1 | User cancelled (ctrl-C or answered N at critical prompt) |
| 2 | Missing required dependency (git, node, claude not on PATH) |
| 3 | File write error (.env, service file) |

## Output Files

All written to the cockpit repo root (where setup is run from):

- `.env` — environment configuration
- `cockpit-api@<username>.service` (Linux) or `com.cockpit.api.plist` (macOS) — service file

## `.env` template contract

All values must be present in generated `.env`; optional values written as empty strings with comment:

```
GITHUB_TOKEN=<provided>
GITHUB_OWNER=<provided>
GITHUB_REPOS=<comma-separated>
REPO_LOCAL_PATHS=<JSON map>
GITHUB_POLL_INTERVAL=30
DB_PATH=<provided or default>
POST_IMPLEMENT_COMMAND=<provided or empty>
PR_COMMENTS_ENABLED=true
DEBUG=false
# Future: secrets can also be stored in GitHub Secrets/Environments
# and injected at runtime via your systemd/launchd service's EnvironmentFile.
```
