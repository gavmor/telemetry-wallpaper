import path from 'node:path';

/**
 * Resolves all relevant paths for the telemetry plugin.
 */
export function resolvePaths(api) {
  const HOME_DIR = process.env.HOME || '/home/user';
  const OPENCLAW_DIR = typeof api?.getPaths === 'function' 
    ? api.getPaths().stateDir 
    : path.join(HOME_DIR, '.openclaw');

  return {
    root: OPENCLAW_DIR,
    sessions: path.join(OPENCLAW_DIR, 'agents/main/sessions'),
    sessionsConfig: path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json'),
    history: path.join(OPENCLAW_DIR, 'storage/plugins/telemetry-collector'),
    state: path.join(OPENCLAW_DIR, 'storage/plugins/telemetry-collector/process_state.json'),
    wallpaper: path.join(OPENCLAW_DIR, 'wallpaper'),
    svg: path.join(OPENCLAW_DIR, 'usage_telemetry.svg'),
    png: path.join(OPENCLAW_DIR, 'usage_telemetry.png'),
    rss: path.join(OPENCLAW_DIR, 'telemetry_feed.xml')
  };
}
