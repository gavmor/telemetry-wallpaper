import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export default function register(api) {
  // Register a named hook that runs after every agent turn
  api.registerHook('agent:turn:end', async (params) => {
    try {
      // Find the extension directory
      const pluginDir = path.dirname(new URL(import.meta.url).pathname);
      const updateScript = path.join(pluginDir, 'src', 'update_wallpaper.sh');

      // Trigger our optimized Python logic
      await execAsync(`/usr/bin/bash "${updateScript}"`);
      
      // The core logger is typically available on the 'context' or through 'api.system'
      // but if api.log failed, we'll use console.log as a fallback for now
      console.log('telemetry-wallpaper: background updated after agent turn');
    } catch (err) {
      console.error(`telemetry-wallpaper: failed to update background: ${err.message}`);
    }
  }, { name: 'telemetry-wallpaper-update' });

  console.log('telemetry-wallpaper: extension registered and listening for agent turns');
}
