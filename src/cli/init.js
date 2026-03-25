import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeConfig, validateConfig, expandHome } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../templates');

// ─── Pure helpers (exported for unit testing) ───────────────────────────────

export function maskToken(token) {
  if (!token || token.length <= 8) return '***';
  return token.slice(0, 4) + '***...' + token.slice(-4);
}


export function buildServiceContent(templateContent, tokens) {
  return Object.entries(tokens).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    templateContent
  );
}

export function getServicePath(platform, homeDir) {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'LaunchAgents', 'com.cockpit.daemon.plist');
  }
  return path.join(homeDir, '.config', 'systemd', 'user', 'cockpit-daemon.service');
}

export function checkPrereqs({ which = defaultWhich, logger = console } = {}) {
  const missing = [];
  for (const cmd of ['git', 'claude']) {
    try {
      which(cmd);
    } catch {
      missing.push(cmd);
    }
  }
  try {
    which('uv');
  } catch {
    logger.warn('Warning: uv not found. specify-cli must be installed manually (pip install specify-cli).');
  }
  if (missing.length > 0) {
    missing.forEach(cmd => logger.error(`Error: '${cmd}' is required but not found in PATH.`));
    return { ok: false, missing, exitCode: 2 };
  }
  return { ok: true, missing: [], exitCode: 0 };
}

export function buildConfigFromEnv(env = process.env) {
  const token = env.GITHUB_TOKEN;
  if (!token || token.trim() === '') {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  const owner = env.GITHUB_OWNER;
  if (!owner || owner.trim() === '') {
    throw new Error('GITHUB_OWNER environment variable is required');
  }

  const reposRaw = (env.GITHUB_REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (reposRaw.length === 0) {
    throw new Error('GITHUB_REPOS environment variable is required (comma-separated owner/repo)');
  }

  let localPathsMap = {};
  if (env.REPO_LOCAL_PATHS) {
    try {
      localPathsMap = JSON.parse(env.REPO_LOCAL_PATHS);
    } catch {
      throw new Error('REPO_LOCAL_PATHS must be valid JSON (e.g. {"owner/repo":"/local/path"})');
    }
  }

  const repos = reposRaw.map(repo => ({
    repo,
    localPath: localPathsMap[repo] || '',
  }));

  return {
    githubToken: token,
    githubOwner: owner,
    pollIntervalSeconds: env.POLL_INTERVAL ? parseInt(env.POLL_INTERVAL, 10) : 30,
    postImplementCommand: env.POST_IMPLEMENT_COMMAND || '',
    repos,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function defaultWhich(cmd) {
  return execSync(`which ${cmd}`, { stdio: 'pipe' }).toString().trim();
}

function getNodePath() {
  try {
    return execSync('which node', { stdio: 'pipe' }).toString().trim();
  } catch {
    return process.execPath;
  }
}

function getCockpitDir() {
  // Resolve the directory where the cockpit package lives
  return path.resolve(__dirname, '../..');
}

// ─── Service file writer ─────────────────────────────────────────────────────

export async function writeServiceFile(platform, { homeDir = os.homedir(), cockpitDir = getCockpitDir(), nodePath = getNodePath(), dryRun = false } = {}) {
  const servicePath = getServicePath(platform, homeDir);
  const templateFile = platform === 'darwin'
    ? 'com.cockpit.daemon.plist.template'
    : 'cockpit-daemon.service.template';

  const templateContent = fs.readFileSync(path.join(TEMPLATES_DIR, templateFile), 'utf8');
  const tokens = platform === 'darwin'
    ? { '{{HOME}}': homeDir, '{{COCKPIT_DIR}}': cockpitDir, '{{NODE_PATH}}': nodePath }
    : { '{{USERNAME}}': os.userInfo().username, '{{COCKPIT_DIR}}': cockpitDir, '{{NODE_PATH}}': nodePath };

  const content = buildServiceContent(templateContent, tokens);

  if (!dryRun) {
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, content, { mode: 0o644 });
  }

  return { servicePath, content };
}

async function enableService(platform, servicePath) {
  if (platform === 'linux') {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    execSync('systemctl --user enable --now cockpit-daemon', { stdio: 'inherit' });
  } else if (platform === 'darwin') {
    const result = spawnSync('launchctl', ['load', servicePath], { stdio: 'pipe' });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim();
      throw new Error(stderr || `launchctl load exited with status ${result.status}`);
    }
  }
}

// ─── specify-cli installer ───────────────────────────────────────────────────

function installSpecifyCli({ which = defaultWhich, logger = console } = {}) {
  let uvPath;
  try {
    uvPath = which('uv');
  } catch {
    logger.warn('uv not found — install specify-cli manually: pip install specify-cli');
    return;
  }
  const result = spawnSync(uvPath, ['tool', 'install', 'specify-cli', '--quiet'], { stdio: 'inherit' });
  if (result.status !== 0) {
    logger.warn('specify-cli installation failed. Install manually: pip install specify-cli');
  }
}

// ─── Constitution writer ──────────────────────────────────────────────────────

export function writeConstitution(localPath, { projectName, principles }, { logger = console } = {}) {
  const constitutionPath = path.join(localPath, '.specify', 'memory', 'constitution.md');

  if (fs.existsSync(constitutionPath)) {
    logger.log(`Constitution already exists at ${constitutionPath}.`);
    logger.log('To update it, open an issue: [COCKPIT] update constitution, or run /speckit.constitution in the repo.');
    return false;
  }

  const dir = path.join(localPath, '.specify', 'memory');
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const content = `# ${projectName} Constitution\n\n## Core Principles\n\n${principles}\n\n**Version**: 1.0.0 | **Ratified**: ${date}\n`;
  fs.writeFileSync(constitutionPath, content, 'utf8');
  return true;
}

// ─── Next-steps printer ──────────────────────────────────────────────────────

function printNextSteps(logger = console) {
  logger.log('');
  logger.log('✅ Cockpit is ready! Next steps:');
  logger.log('');
  logger.log('  cockpit status          — check daemon health');
  logger.log('  cockpit start           — start the daemon (if not already running)');
  logger.log('');
  logger.log('Open a GitHub issue in a watched repo titled:');
  logger.log('  [COCKPIT] <your feature name>');
}

// ─── Main runInit entry point ─────────────────────────────────────────────────

export async function runInit(options = {}) {
  const { yes = false, configDir = expandHome('~/.cockpit'), logger = console } = options;

  // Step 1: Check prerequisites
  const prereqs = checkPrereqs({ logger });
  if (!prereqs.ok) {
    process.exit(prereqs.exitCode);
  }

  // Step 2: Collect config
  let config;
  let constitutions = [];
  if (yes) {
    try {
      config = buildConfigFromEnv(options.env || process.env);
    } catch (err) {
      logger.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else {
    const result = await collectConfigInteractive({ configDir, logger });
    if (!result) return; // user cancelled
    config = result.config;
    constitutions = result.constitutions;
  }

  // Step 3: Validate
  try {
    validateConfig(config);
  } catch (err) {
    logger.error(`Config error: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Write config
  writeConfig(configDir, config);
  logger.log(`Config written to ${configDir}/config.json`);

  // Step 5: Write service file
  const { servicePath } = await writeServiceFile(process.platform, {
    homeDir: os.homedir(),
    cockpitDir: getCockpitDir(),
    nodePath: getNodePath(),
  });
  logger.log(`Service file written to ${servicePath}`);

  // Step 6: Enable service
  try {
    await enableService(process.platform, servicePath);
    logger.log('Service enabled and started.');
  } catch (err) {
    logger.warn(`Could not enable service automatically: ${err.message}`);
    logger.warn('Run manually: systemctl --user enable --now cockpit-daemon');
  }

  // Step 7: Install specify-cli
  installSpecifyCli({ logger });

  // Step 8: Write constitutions
  for (const { localPath, projectName, principles } of constitutions) {
    try {
      const wrote = writeConstitution(localPath, { projectName, principles }, { logger });
      if (wrote) logger.log(`Constitution written to ${localPath}/.specify/memory/constitution.md`);
    } catch (err) {
      logger.warn(`Could not write constitution for ${localPath}: ${err.message}`);
    }
  }

  // Step 9: Print next steps
  printNextSteps(logger);
}

// ─── Interactive TUI (requires @clack/prompts) ───────────────────────────────

async function collectConfigInteractive({ configDir, logger }) {
  const { intro, outro, text, password, confirm, isCancel } = await import('@clack/prompts');

  // T003: Load existing config (no confirm gate — go straight to pre-filled wizard)
  const existingPath = path.join(configDir, 'config.json');
  let existing = null;
  if (fs.existsSync(existingPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    } catch {
      // T004: Warn on malformed config, fall back to fresh setup
      logger.warn('Config file could not be read — starting fresh setup.');
      existing = null;
    }
  }

  intro('Cockpit Setup Wizard');

  // T009: Token prompt — show masked hint when existing token is present
  let token;
  if (existing?.githubToken) {
    const hint = maskToken(existing.githubToken);
    const raw = await password({
      message: `GitHub personal access token [current: ${hint}, Enter to keep]:`,
    });
    if (isCancel(raw)) { outro('Cancelled.'); return null; }
    token = raw.trim() === '' ? existing.githubToken : raw;
  } else {
    const raw = await password({ message: 'GitHub personal access token (repo scope):' });
    if (isCancel(raw)) { outro('Cancelled.'); return null; }
    token = raw;
  }

  // T005: Pre-fill owner with existing value
  const owner = await text({
    message: 'GitHub username (only issues from this account will be processed):',
    initialValue: existing?.githubOwner ?? '',
    validate: v => v.trim() ? undefined : 'Required',
  });
  if (isCancel(owner)) { outro('Cancelled.'); return null; }

  // T006: Poll interval prompt with existing value
  const pollIntervalRaw = await text({
    message: 'Poll interval in seconds:',
    initialValue: String(existing?.pollIntervalSeconds ?? 30),
    validate: v => /^\d+$/.test(v.trim()) ? undefined : 'Must be a number',
  });
  if (isCancel(pollIntervalRaw)) { outro('Cancelled.'); return null; }

  // T007: Post-implement command prompt with existing value
  const postCmd = await text({
    message: 'Post-implement shell command (optional, runs after each implement stage):',
    initialValue: existing?.postImplementCommand ?? '',
  });
  if (isCancel(postCmd)) { outro('Cancelled.'); return null; }

  // T010/T011: Repos — print summary of existing repos, then offer to add more
  const repos = existing?.repos?.length > 0 ? [...existing.repos] : [];
  if (repos.length > 0) {
    logger.log('\nWatched repos:');
    for (const r of repos) {
      logger.log(`  • ${r.repo}  →  ${r.localPath}`);
    }
  }

  let addMore = repos.length === 0; // always enter loop on first run; ask on re-run
  if (repos.length > 0) {
    const more = await confirm({ message: 'Add another repo?', initialValue: false });
    if (isCancel(more)) { outro('Cancelled.'); return null; }
    addMore = !!more;
  }

  while (addMore) {
    const repoName = await text({ message: 'Repo to watch (owner/name format):', validate: v => /^[\w.-]+\/[\w.-]+$/.test(v.trim()) ? undefined : 'Use owner/name format' });
    if (isCancel(repoName)) { outro('Cancelled.'); return null; }

    const alreadyCloned = await confirm({
      message: `Have you already cloned ${repoName.trim()} locally?`,
      initialValue: true,
    });
    if (isCancel(alreadyCloned)) { outro('Cancelled.'); return null; }

    let resolvedPath;
    if (alreadyCloned) {
      const localPath = await text({ message: `Local path to your clone of ${repoName.trim()}:`, validate: v => v.trim() ? undefined : 'Required' });
      if (isCancel(localPath)) { outro('Cancelled.'); return null; }
      resolvedPath = localPath.trim();
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(`Warning: path '${resolvedPath}' does not exist. You can fix this later.`);
      }
    } else {
      const defaultPath = path.join(os.homedir(), 'repos', repoName.trim().split('/')[1]);
      const clonePath = await text({
        message: `Where should it be cloned? (local destination path)`,
        initialValue: defaultPath,
        validate: v => v.trim() ? undefined : 'Required',
      });
      if (isCancel(clonePath)) { outro('Cancelled.'); return null; }
      resolvedPath = clonePath.trim();
      try {
        const parentDir = path.dirname(resolvedPath);
        fs.mkdirSync(parentDir, { recursive: true });
        execSync(`git clone https://github.com/${repoName.trim()} ${resolvedPath}`, { stdio: 'inherit' });
        logger.log(`Cloned ${repoName.trim()} to ${resolvedPath}`);
      } catch (err) {
        logger.warn(`Clone failed: ${err.message}. You can fix this later.`);
      }
    }

    repos.push({ repo: repoName.trim(), localPath: resolvedPath });

    const more = await confirm({ message: 'Add another repo?', initialValue: false });
    if (isCancel(more) || !more) addMore = false;
  }

  outro('Config collected.');

  // Prompt for constitution per repo (only for repos with existing local paths)
  const constitutions = [];
  for (const repo of repos) {
    if (!fs.existsSync(repo.localPath)) continue;

    const wantConstitution = await confirm({
      message: `Define project principles for ${repo.repo}? (writes .specify/memory/constitution.md)`,
      initialValue: true,
    });
    if (isCancel(wantConstitution) || !wantConstitution) continue;

    const projectName = await text({
      message: `Project name for ${repo.repo}:`,
      defaultValue: repo.repo.split('/')[1],
    });
    if (isCancel(projectName)) continue;

    const principles = await text({
      message: 'Core principles (brief description of how Claude should approach work in this repo):',
      validate: v => v.trim() ? undefined : 'Required',
    });
    if (isCancel(principles)) continue;

    constitutions.push({ localPath: repo.localPath, projectName: projectName.trim(), principles: principles.trim() });
  }

  // T008: Use prompted values for pollIntervalSeconds and postImplementCommand
  return {
    config: {
      githubToken: token,
      githubOwner: owner.trim(),
      pollIntervalSeconds: parseInt(pollIntervalRaw.trim(), 10),
      postImplementCommand: postCmd.trim(),
      repos,
    },
    constitutions,
  };
}
