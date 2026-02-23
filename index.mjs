import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

export default function register(api) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const getStateDir = () => {
    if (typeof api.runtime?.state?.resolveStateDir === 'function') {
      return api.runtime.state.resolveStateDir();
    }
    return path.join(process.env.HOME || '/home/user', '.openclaw');
  };

  const runUpdate = async (source) => {
    try {
      const updateScript = path.join(__dirname, 'src', 'update_wallpaper.sh');
      const stateDir = getStateDir();

      console.log(`telemetry-wallpaper: triggering update from ${source}`);

      const env = {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_SESSIONS_DIR: path.join(stateDir, 'agents/main/sessions'),
        TELEMETRY_SPIKE_THRESHOLD: String(api.pluginConfig?.spikeThreshold || 50000),
        TELEMETRY_THEME: api.pluginConfig?.theme || 'gruvbox-dark',
        TELEMETRY_RESOLUTION: api.pluginConfig?.resolution || '1920x1080'
      };

      await execAsync(`/usr/bin/bash "${updateScript}"`, { env });
      console.log('telemetry-wallpaper: background updated successfully');
    } catch (err) {
      console.error(`telemetry-wallpaper: update failed: ${err.message}`);
    }
  };

  // Try multiple known event names
  const events = [
    'gateway:startup',
    'agent:turn:end',
    'message_received',
    'message_sent',
    'command:new'
  ];

  for (const event of events) {
    api.on(event, async () => {
      console.log(`telemetry-wallpaper: event received: ${event}`);
      await runUpdate(event);
    });
  }

  // Final manual trigger for registration confirmation
  runUpdate('registration');

  console.log('telemetry-wallpaper: extension fully armed with multiple event listeners');
}
