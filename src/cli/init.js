import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeConfig, validateConfig, expandHome } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../templates');

// ─── Pure helpers (exported for unit testing) ───────────────────────────────

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
    execSync(`launchctl load "${servicePath}"`, { stdio: 'inherit' });
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

// ─── Next-steps printer ──────────────────────────────────────────────────────

function printNextSteps(logger = console) {
  logger.log('');
  logger.log('✅ Cockpit is ready! Next steps:');
  logger.log('');
  logger.log('  cockpit status          — check daemon health');
  logger.log('  cockpit start           — start the daemon (if not already running)');
  logger.log('  specify init --here --ai claude   — initialise spec-kit in a watched repo');
  logger.log('');
  logger.log('Open a GitHub issue in a watched repo titled:');
  logger.log('  [COCKPIT] <your feature name>');
  logger.log('');
  logger.log('To define project principles:');
  logger.log('  /speckit.constitution');
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
  if (yes) {
    try {
      config = buildConfigFromEnv(options.env || process.env);
    } catch (err) {
      logger.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else {
    config = await collectConfigInteractive({ configDir, logger });
    if (!config) return; // user cancelled
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

  // Step 8: Print next steps
  printNextSteps(logger);
}

// ─── Interactive TUI (requires @clack/prompts) ───────────────────────────────

async function collectConfigInteractive({ configDir, logger }) {
  const { intro, outro, text, password, confirm, isCancel } = await import('@clack/prompts');

  // Check for existing config
  const existingPath = path.join(configDir, 'config.json');
  if (fs.existsSync(existingPath)) {
    const { createRequire } = await import('node:module');
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    } catch {
      existing = null;
    }
    if (existing) {
      const update = await confirm({
        message: `Existing config found at ${existingPath}. Update it?`,
      });
      if (isCancel(update) || !update) {
        outro('Cancelled.');
        return null;
      }
    }
  }

  intro('Cockpit Setup Wizard');

  const token = await password({ message: 'GitHub personal access token (repo scope):' });
  if (isCancel(token)) { outro('Cancelled.'); return null; }

  const owner = await text({ message: 'GitHub username (only issues from this account will be processed):', validate: v => v.trim() ? undefined : 'Required' });
  if (isCancel(owner)) { outro('Cancelled.'); return null; }

  const repos = [];
  let addMore = true;
  while (addMore) {
    const repoName = await text({ message: 'Repo to watch (owner/name format):', validate: v => /^[\w.-]+\/[\w.-]+$/.test(v.trim()) ? undefined : 'Use owner/name format' });
    if (isCancel(repoName)) { outro('Cancelled.'); return null; }

    const localPath = await text({ message: `Local clone path for ${repoName}:`, validate: v => v.trim() ? undefined : 'Required' });
    if (isCancel(localPath)) { outro('Cancelled.'); return null; }

    if (!fs.existsSync(localPath.trim())) {
      logger.warn(`Warning: path '${localPath.trim()}' does not exist on disk. You can continue and fix this later.`);
    }

    repos.push({ repo: repoName.trim(), localPath: localPath.trim() });

    const more = await confirm({ message: 'Add another repo?', initialValue: false });
    if (isCancel(more) || !more) addMore = false;
  }

  outro('Config collected.');

  return {
    githubToken: token,
    githubOwner: owner.trim(),
    pollIntervalSeconds: 30,
    postImplementCommand: '',
    repos,
  };
}
