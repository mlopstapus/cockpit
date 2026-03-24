import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function readConfig(dir = '~/.cockpit', filename = 'config.json') {
  const resolvedDir = expandHome(dir);
  const cfgPath = path.join(resolvedDir, filename);
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const parsed = JSON.parse(raw);
  // Apply defaults
  if (parsed.pollIntervalSeconds === undefined || parsed.pollIntervalSeconds === null) {
    parsed.pollIntervalSeconds = 30;
  }
  if (parsed.postImplementCommand === undefined) {
    parsed.postImplementCommand = '';
  }
  return parsed;
}

export function writeConfig(dir = '~/.cockpit', config) {
  const resolvedDir = expandHome(dir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  const cfgPath = path.join(resolvedDir, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  // Ensure mode is exactly 0o600 (writeFileSync mode may be masked by umask)
  fs.chmodSync(cfgPath, 0o600);
}

export function validateConfig(config) {
  if (!config || !config.githubToken || config.githubToken.trim() === '') {
    throw new Error('Config validation failed: githubToken is required and must be non-empty');
  }
  if (!config.githubOwner || config.githubOwner.trim() === '') {
    throw new Error('Config validation failed: githubOwner is required and must be non-empty');
  }
  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    throw new Error('Config validation failed: repos must be a non-empty array');
  }
}
