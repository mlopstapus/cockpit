/**
 * Template rendering and file writing for Cockpit setup.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as p from '@clack/prompts';
import chalk from 'chalk';

/**
 * Read a template file and replace all {{TOKEN}} occurrences with values.
 * Unknown tokens are left as-is.
 * @param {string} templatePath - Absolute path to the template file
 * @param {Record<string, string>} values - Map of TOKEN → replacement value
 * @returns {string} Rendered content
 */
export function renderTemplate(templatePath, values) {
  const content = readFileSync(templatePath, 'utf8');
  return content.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    return Object.prototype.hasOwnProperty.call(values, token) ? values[token] : match;
  });
}

/**
 * Render and write the .env file. Prompts before overwriting if it exists.
 * @param {object} profile - SetupProfile from collectCockpitConfig
 * @param {string} cockpitDir - Cockpit repo root directory
 * @param {object} opts - CLI options (yes: boolean)
 */
export async function writeEnvFile(profile, cockpitDir, opts) {
  const templatePath = join(cockpitDir, 'setup', 'templates', '.env.template');
  const destPath = join(cockpitDir, '.env');

  if (existsSync(destPath) && !opts.yes) {
    const overwrite = await p.confirm({
      message: `.env already exists — overwrite?`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.log.warn('Skipped .env write (file preserved).');
      return;
    }
  }

  const repoLocalPathsJson = JSON.stringify(profile.repoLocalPaths);
  const rendered = renderTemplate(templatePath, {
    GITHUB_TOKEN: profile.githubToken,
    GITHUB_OWNER: profile.githubOwner,
    GITHUB_REPOS: profile.githubRepos.join(','),
    REPO_LOCAL_PATHS: repoLocalPathsJson,
    DB_PATH: profile.dbPath,
    POST_IMPLEMENT_COMMAND: profile.postImplementCommand || '',
  });

  writeFileSync(destPath, rendered, 'utf8');
  p.log.success(chalk.green(`✅ Written: ${destPath}`));
}

/**
 * Render and write the OS-appropriate service file.
 * Prints copy/load instructions to stdout.
 * @param {object} profile - SetupProfile
 * @param {string} cockpitDir - Cockpit repo root directory
 */
export function writeServiceFile(profile, cockpitDir) {
  if (profile.os === 'darwin') {
    _writeLaunchdPlist(profile, cockpitDir);
  } else {
    _writeSystemdUnit(profile, cockpitDir);
  }
}

function _writeSystemdUnit(profile, cockpitDir) {
  const templatePath = join(cockpitDir, 'setup', 'templates', 'cockpit-api@.service.template');
  const destName = `cockpit-api@${profile.username}.service`;
  const destPath = join(cockpitDir, destName);

  const rendered = renderTemplate(templatePath, {
    USERNAME: profile.username,
    COCKPIT_DIR: cockpitDir,
  });

  writeFileSync(destPath, rendered, 'utf8');
  p.log.success(chalk.green(`✅ Written: ${destPath}`));
  console.log('');
  console.log(chalk.bold('To install and start the service:'));
  console.log(chalk.cyan(`  sudo cp ${destPath} /etc/systemd/system/`));
  console.log(chalk.cyan(`  sudo systemctl daemon-reload`));
  console.log(chalk.cyan(`  sudo systemctl enable --now cockpit-api@${profile.username}`));
  console.log('');
}

function _writeLaunchdPlist(profile, cockpitDir) {
  const templatePath = join(cockpitDir, 'setup', 'templates', 'com.cockpit.api.plist.template');
  const destPath = join(
    process.env.HOME || require('os').homedir(),
    'Library', 'LaunchAgents', 'com.cockpit.api.plist'
  );

  const repoLocalPathsJson = JSON.stringify(profile.repoLocalPaths);
  const rendered = renderTemplate(templatePath, {
    USERNAME: profile.username,
    COCKPIT_DIR: cockpitDir,
    HOME: process.env.HOME || require('os').homedir(),
    GITHUB_TOKEN: profile.githubToken,
    GITHUB_OWNER: profile.githubOwner,
    GITHUB_REPOS: profile.githubRepos.join(','),
    REPO_LOCAL_PATHS: repoLocalPathsJson,
    DB_PATH: profile.dbPath,
    POST_IMPLEMENT_COMMAND: profile.postImplementCommand || '',
  });

  writeFileSync(destPath, rendered, 'utf8');
  p.log.success(chalk.green(`✅ Written: ${destPath}`));
  console.log('');
  console.log(chalk.bold('To load the service:'));
  console.log(chalk.cyan(`  launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist`));
  console.log('');
}
