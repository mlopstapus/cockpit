import fs from 'node:fs';
import { readConfig, writeConfig } from '../config/index.js';

export function repoList(configDir, logger = console) {
  const config = readConfig(configDir);
  if (config.repos.length === 0) {
    logger.log('No repos configured.');
    return;
  }
  logger.log('Watched repos:');
  for (const r of config.repos) {
    const exists = fs.existsSync(r.localPath);
    logger.log(`  ${r.repo}  →  ${r.localPath}  [${exists ? 'exists' : 'missing'}]`);
  }
}

export function repoAdd(configDir, repoName, localPath, logger = {}) {
  const log = logger.log ? (m) => logger.log(m) : (m) => console.log(m);
  const warn = logger.warn ? (m) => logger.warn(m) : (m) => console.warn(m);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoName)) {
    throw new Error(`Invalid repo format: '${repoName}'. Use owner/name format.`);
  }

  if (!fs.existsSync(localPath)) {
    warn(`Warning: path '${localPath}' does not exist on disk. Add it anyway.`);
  }

  const config = readConfig(configDir);
  const existing = config.repos.find(r => r.repo === repoName);
  if (existing) {
    warn(`Repo '${repoName}' is already configured.`);
    return;
  }

  config.repos.push({ repo: repoName, localPath });
  writeConfig(configDir, config);
  log(`Added ${repoName} → ${localPath}`);
}

export function repoRemove(configDir, repoName, logger = console) {
  const config = readConfig(configDir);
  const idx = config.repos.findIndex(r => r.repo === repoName);
  if (idx === -1) {
    throw new Error(`Repo '${repoName}' not found in config.`);
  }
  config.repos.splice(idx, 1);
  writeConfig(configDir, config);
  logger.log(`Removed ${repoName}`);
}
