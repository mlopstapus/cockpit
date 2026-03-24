#!/usr/bin/env node
/**
 * Cockpit Setup CLI
 * Guides a new developer through configuration, generates .env and service files,
 * installs specify-cli, and prints next-step instructions.
 *
 * Usage: node setup/index.js [--yes] [--target <path>]
 */
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';

import { collectCockpitConfig } from './prompts.js';
import { writeEnvFile, writeServiceFile } from './render.js';

const program = new Command();

program
  .name('cockpit-setup')
  .description('Interactive setup for Claude Cockpit')
  .option('-y, --yes', 'Non-interactive mode; accept all defaults', false)
  .option('--target <path>', 'Target repo path (skip prompt)')
  .helpOption('-h, --help', 'Print usage and exit')
  .parse(process.argv);

const opts = program.opts();

// ── Prerequisite check ─────────────────────────────────────────────────────

function checkPrereqs() {
  const required = ['git', 'claude'];
  const optional = ['uv'];
  const missing = [];
  const missingOptional = [];

  for (const cmd of required) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (result.status !== 0 && result.error) {
      missing.push(cmd);
    }
  }

  for (const cmd of optional) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (result.status !== 0 && result.error) {
      missingOptional.push(cmd);
    }
  }

  if (missing.length > 0) {
    console.error(chalk.red(`\n✗ Missing required tools: ${missing.join(', ')}`));
    for (const cmd of missing) {
      if (cmd === 'claude') {
        console.error(chalk.yellow('  Install Claude Code: https://claude.ai/code'));
      } else if (cmd === 'git') {
        console.error(chalk.yellow('  Install git: https://git-scm.com/downloads'));
      }
    }
    process.exit(2);
  }

  if (missingOptional.includes('uv')) {
    console.warn(chalk.yellow('\n⚠  uv not found — spec-kit install will be skipped.'));
    console.warn(chalk.yellow('   Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh'));
  }

  return { uvAvailable: !missingOptional.includes('uv') };
}

// ── Phase 3: spec-kit install ──────────────────────────────────────────────

async function runSpecKitPhase(profile, uvAvailable) {
  if (!uvAvailable) {
    p.log.warn('Skipping spec-kit install: uv not found. Install uv and re-run setup.');
    return;
  }

  let shouldInstall = true;
  if (!opts.yes) {
    const answer = await p.confirm({
      message: 'Install specify-cli (spec-kit)?',
      initialValue: true,
    });
    if (p.isCancel(answer) || !answer) {
      p.log.info('Skipped spec-kit install.');
      return;
    }
    shouldInstall = answer;
  }

  if (shouldInstall) {
    p.log.step('Installing specify-cli via uv...');
    const result = spawnSync(
      'uv',
      ['tool', 'install', 'specify-cli', '--from', 'git+https://github.com/github/spec-kit.git'],
      { stdio: 'inherit' }
    );
    if (result.status === 0) {
      p.log.success(chalk.green('✅ specify-cli installed. Run `specify check` to verify.'));
    } else {
      p.log.warn(chalk.yellow(`⚠  specify-cli install failed (exit ${result.status}) — continuing.`));
    }
  }
}

// ── Phase 4: Next steps ────────────────────────────────────────────────────

function printNextSteps(profile) {
  const isLinux = profile.os !== 'darwin';
  const serviceCmd = isLinux
    ? `sudo systemctl enable --now cockpit-api@${profile.username}`
    : `launchctl load ~/Library/LaunchAgents/com.cockpit.api.plist`;

  const targetRepo = profile.targetRepoPath || Object.values(profile.repoLocalPaths)[0] || '<your-target-repo>';

  console.log('');
  console.log(chalk.bold.green('🚀 Cockpit is configured! Next steps:'));
  console.log('');
  console.log(chalk.bold('  1. Start the Cockpit service:'));
  console.log(chalk.cyan(`     ${serviceCmd}`));
  console.log('');
  console.log(chalk.bold('  2. Initialise spec-kit in your target repo:'));
  console.log(chalk.cyan(`     cd ${targetRepo}`));
  console.log(chalk.cyan(`     specify init --here --ai claude`));
  console.log('');
  console.log(chalk.bold('  3. Build your project constitution:'));
  console.log(chalk.cyan(`     Open Claude Code in ${targetRepo} and run:`));
  console.log(chalk.cyan(`       /speckit.constitution`));
  console.log('');
  console.log(chalk.bold('  4. Trigger the pipeline:'));
  console.log(chalk.cyan(`     Open an issue titled [COCKPIT] <feature> in your watched repo`));
  console.log('');
  console.log(chalk.dim('  Expo migration: set POST_IMPLEMENT_COMMAND=systemctl --user restart seamless-expo'));
  console.log(chalk.dim('  in .env to preserve previous Expo restart behavior.'));
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Prerequisite check
  let uvAvailable;
  try {
    ({ uvAvailable } = checkPrereqs());
  } catch (err) {
    console.error(chalk.red(`Setup error: ${err.message}`));
    process.exit(2);
  }

  // Phase 1: Collect config
  let profile;
  try {
    profile = await collectCockpitConfig(opts);
  } catch (err) {
    if (err.message?.includes('cancel') || err.message?.includes('Cancel')) {
      process.exit(1);
    }
    console.error(chalk.red(`Config error: ${err.message}`));
    process.exit(1);
  }

  // Phase 2: Generate .env and service file
  const cockpitDir = profile.cockpitDir;
  try {
    await writeEnvFile(profile, cockpitDir, opts);
    writeServiceFile(profile, cockpitDir);
  } catch (err) {
    console.error(chalk.red(`File write error: ${err.message}`));
    process.exit(3);
  }

  // Phase 3: Install spec-kit
  await runSpecKitPhase(profile, uvAvailable);

  // Phase 4: Print next steps
  printNextSteps(profile);
}

main().catch((err) => {
  console.error(chalk.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
