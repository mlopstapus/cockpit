/**
 * Interactive prompts for Cockpit setup.
 * Uses @clack/prompts for a clean CLI UX.
 */
import * as p from '@clack/prompts';
import os from 'os';
import { existsSync } from 'fs';

/**
 * Collect all configuration needed to generate .env and service files.
 * @param {object} opts - CLI options (yes: boolean, target: string|undefined)
 * @returns {Promise<SetupProfile>}
 */
export async function collectCockpitConfig(opts) {
  const detectedOs = process.platform === 'darwin' ? 'darwin' : 'linux';
  const detectedUsername = os.userInfo().username;
  const cockpitDir = process.cwd();

  if (opts.yes) {
    // Non-interactive: return defaults (useful for testing / scripted installs)
    const targetRepo = opts.target || '';
    return {
      githubToken: process.env.GITHUB_TOKEN || '',
      githubOwner: process.env.GITHUB_OWNER || '',
      githubRepos: process.env.GITHUB_REPOS ? process.env.GITHUB_REPOS.split(',').map(r => r.trim()) : [],
      repoLocalPaths: {},
      targetRepoPath: targetRepo,
      postImplementCommand: process.env.POST_IMPLEMENT_COMMAND || '',
      dbPath: process.env.DB_PATH || `${os.homedir()}/.cockpit/cockpit.db`,
      os: detectedOs,
      username: detectedUsername,
      cockpitDir,
    };
  }

  p.intro('🚀 Cockpit Setup');

  // Phase 1: Cockpit configuration
  const answers = await p.group(
    {
      githubToken: () =>
        p.password({
          message: 'GitHub Personal Access Token (repo + issues scope)',
          validate: (v) => (!v ? 'Token is required' : undefined),
        }),

      githubOwner: () =>
        p.text({
          message: 'GitHub owner or organisation',
          placeholder: 'your-username',
          validate: (v) => (!v.trim() ? 'Owner is required' : undefined),
        }),

      githubReposRaw: () =>
        p.text({
          message: 'Repos to watch (comma-separated, e.g. owner/repo1,owner/repo2)',
          placeholder: 'owner/repo',
          validate: (v) => (!v.trim() ? 'At least one repo is required' : undefined),
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(1);
      },
    }
  );

  const githubRepos = answers.githubReposRaw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  // Prompt for local path for each repo
  const repoLocalPaths = {};
  for (const repo of githubRepos) {
    const localPath = await p.text({
      message: `Local path for ${repo}`,
      placeholder: `${os.homedir()}/repos/${repo.split('/').pop()}`,
      validate: (v) => (!v.trim() ? 'Path is required' : undefined),
    });
    if (p.isCancel(localPath)) {
      p.cancel('Setup cancelled.');
      process.exit(1);
    }
    const resolved = localPath.trim();
    if (!existsSync(resolved)) {
      p.log.warn(`⚠  Path does not exist yet: ${resolved} — you can create it before starting Cockpit`);
    }
    repoLocalPaths[repo] = resolved;
  }

  const targetRepoPath = opts.target || Object.values(repoLocalPaths)[0] || '';

  const postImplementCommand = await p.text({
    message: 'Post-implement command (optional)',
    placeholder: 'e.g. systemctl --user restart my-app',
  });
  if (p.isCancel(postImplementCommand)) {
    p.cancel('Setup cancelled.');
    process.exit(1);
  }

  const dbPath = await p.text({
    message: 'Database path',
    initialValue: `${os.homedir()}/.cockpit/cockpit.db`,
  });
  if (p.isCancel(dbPath)) {
    p.cancel('Setup cancelled.');
    process.exit(1);
  }

  return {
    githubToken: answers.githubToken,
    githubOwner: answers.githubOwner.trim(),
    githubRepos,
    repoLocalPaths,
    targetRepoPath,
    postImplementCommand: postImplementCommand || '',
    dbPath: dbPath || `${os.homedir()}/.cockpit/cockpit.db`,
    os: detectedOs,
    username: detectedUsername,
    cockpitDir,
  };
}
