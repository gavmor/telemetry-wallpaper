import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export default function register(api) {
  // Use gateway-native path helpers
  const paths = api.getPaths();
  // Read extension-specific config from openclaw.plugin.json / openclaw.json
  const pluginCfg = api.pluginConfig || {};

  const runUpdate = async () => {
    try {
      const pluginDir = path.dirname(new URL(import.meta.url).pathname);
      const cleanPluginDir = pluginDir.startsWith('file:') ? new URL(pluginDir).pathname : pluginDir;
      const updateScript = path.join(cleanPluginDir, 'src', 'update_wallpaper.sh');

      // Pass system paths and plugin config to the subprocess via ENV
      const env = {
        ...process.env,
        OPENCLAW_STATE_DIR: paths.stateDir,
        OPENCLAW_SESSIONS_DIR: path.join(paths.stateDir, 'agents/main/sessions'),
        OPENCLAW_CONFIG_PATH: paths.configPath,
        TELEMETRY_SPIKE_THRESHOLD: String(pluginCfg.spikeThreshold || 50000),
        TELEMETRY_THEME: pluginCfg.theme || 'gruvbox-dark',
        TELEMETRY_RESOLUTION: pluginCfg.resolution || '1920x1080'
      };

      await execAsync(`/usr/bin/bash "${updateScript}"`, { env });
      console.log('telemetry-wallpaper: background updated');
    } catch (err) {
      console.error(`telemetry-wallpaper: update failed: ${err.message}`);
    }
  };

  // 1. Update on startup
  api.registerHook('gateway:startup', async () => {
    await runUpdate();
  }, { name: 'telemetry-wallpaper-startup' });

  // 2. Update after every turn
  api.registerHook('agent:turn:end', async () => {
    await runUpdate();
  }, { name: 'telemetry-wallpaper-turn' });

  console.log('telemetry-wallpaper: extension registered with internal path helpers');
}
