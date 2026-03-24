import { readConfig, writeConfig } from '../config/index.js';

export async function rotateToken(configDir) {
  const { password, intro, outro } = await import('@clack/prompts');

  intro('Token Rotation');

  const token = await password({ message: 'New GitHub personal access token:' });

  // Check for cancellation
  if (typeof token !== 'string') {
    outro('Cancelled.');
    return;
  }

  const config = readConfig(configDir);
  config.githubToken = token;
  writeConfig(configDir, config);

  outro('Token updated. The daemon will pick it up on the next poll cycle.');
}
