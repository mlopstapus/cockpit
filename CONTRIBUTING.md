# Contributing to Cockpit

Thanks for your interest. Here's how to get involved.

## Bug Reports

Open a [GitHub Issue](https://github.com/andersbe/cockpit/issues) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Output of `cockpit status` and `cockpit logs -n 50`
- Your OS and Node.js version (`node --version`)

## Feature Requests

Open a `[COCKPIT]` issue — Cockpit builds its own features using itself:

```
[COCKPIT] <feature description>
```

This is the intended workflow. The spec-kit pipeline will pick it up, clarify requirements, and produce a PR.

## Pull Requests

1. Fork the repo and create a branch following the naming convention: `###-short-description` (e.g. `008-retry-failed-jobs`)
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure lint passes: `npm run lint`
5. Open a PR against `main` with a clear description of the change

A few rules:
- No `--no-verify` commits (don't bypass hooks)
- No force-push to `main`
- Auto-merge is not used — all PRs require manual review

## Local Development

```bash
git clone https://github.com/andersbe/cockpit
cd cockpit
npm install

# Run tests
npm test

# Lint
npm run lint

# Verify native modules compile
npm run build

# Run the daemon directly (development mode — no service manager)
node src/daemon/index.js
```

The daemon reads `~/.cockpit/config.json` on each poll cycle, so you can edit config without restarting.

For the full setup wizard flow: `cockpit init` (or `node src/cli/index.js init`).
