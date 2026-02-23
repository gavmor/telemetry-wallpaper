import { runTelemetry } from './src/telemetry.mjs';

/**
 * Extension entry point.
 * Migrated to pure ESM JavaScript.
 */
export default function register(api) {
  const handleUpdate = async (source) => {
    try {
      console.log(`telemetry-wallpaper: update triggered by ${source}`);
      await runTelemetry(api);
      console.log(`telemetry-wallpaper: update successful (${source})`);
    } catch (err) {
      console.error(`telemetry-wallpaper: update failed [${source}]: ${err.message}`);
    }
  };

  try {
    // Standard event listeners
    api.on('gateway:startup', () => handleUpdate('gateway:startup'));
    api.on('message_sent', () => handleUpdate('message_sent'));
    api.on('message_received', () => handleUpdate('message_received'));

    // Initial trigger
    setTimeout(() => handleUpdate('registration'), 2000);

    console.log('telemetry-wallpaper: extension registered and armed');
  } catch (err) {
    console.error('telemetry-wallpaper: registration failed', err);
  }
}
