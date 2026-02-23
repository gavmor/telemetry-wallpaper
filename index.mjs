import { runTelemetry } from './src/telemetry.mjs';
import { handleTelemetryHttpRequest } from './src/server.mjs';

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

    // Register HTTP handler for remote delivery
    api.registerHttpHandler((req, res) => handleTelemetryHttpRequest(req, res, api));

    // Initial trigger
    setTimeout(() => handleUpdate('registration'), 2000);

    // Heartbeat every 15 minutes to keep the clock/chart fresh
    setInterval(() => handleUpdate('heartbeat'), 15 * 60 * 1000);

    console.log('telemetry-wallpaper: extension registered and armed with HTTP server');
  } catch (err) {
    console.error('telemetry-wallpaper: registration failed', err);
  }
}
