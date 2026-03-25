# Quickstart: 006-init-speckit-constitution

## What's changing

`cockpit init` gains three new steps in the repo-adding flow:

1. **Already cloned?** — Asks if the repo is already local. If not, clones it using your PAT.
2. **Spec-kit install** — Offers to run `specify init <path> --ai claude` in each registered repo.
3. **Constitution wizard** — Guides through four prompts to create `.specify/memory/constitution.md`.

All steps are individually skippable.

## Running the new init flow

```bash
cockpit init
```

The wizard will now ask, for each repo:

```
Have you already cloned this repo locally? › Yes / No

# If No:
GitHub repo (owner/name or HTTPS URL): › myuser/myrepo
Clone to: › /Users/me/repos/myrepo

# After repo is registered:
Install spec-kit into /Users/me/repos/myrepo? › Yes / No
Set up a project constitution? › Yes / No
```

## Testing the new helpers manually

```bash
# Parse a repo identifier
node -e "
import('./src/cli/init.js').then(m => {
  console.log(m.parseRepoIdentifier('myuser/myrepo'));
  console.log(m.parseRepoIdentifier('https://github.com/myuser/myrepo'));
});"

# Build a clone URL (do not log in real use)
node -e "
import('./src/cli/init.js').then(m => {
  console.log(m.buildCloneUrl('myuser/myrepo', 'ghp_test'));
});"
```

## Running tests

```bash
npm test
```

New test file: `test/unit/init-repo-setup.test.js`

## Non-interactive (CI) usage

```bash
GITHUB_TOKEN=ghp_... \
GITHUB_OWNER=myuser \
GITHUB_REPOS=myuser/myrepo \
REPO_LOCAL_PATHS='{"myuser/myrepo":"/repos/myrepo"}' \
SPECKIT_INIT=1 \
cockpit init --yes
```

`SPECKIT_INIT=1` triggers `specify init` for each repo after config is written. Constitution wizard is not available in `--yes` mode.
