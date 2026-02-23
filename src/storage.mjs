import fs from 'node:fs/promises';

/**
 * Loads session metadata for channel attribution.
 */
export async function loadSessionMetadata(configPath) {
  try {
    const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const metadata = {};
    for (const [_, val] of Object.entries(raw)) {
      if (val.sessionId) {
        const origin = val.origin || {};
        metadata[val.sessionId] = `${origin.provider || 'local'}/${origin.label || 'unknown'}`;
      }
    }
    return metadata;
  } catch (e) {
    return {};
  }
}

/**
 * Loads the current process state.
 */
export async function loadState(statePath) {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (e) {
    return { cursors: {}, daily_stats: {}, spikes: {} };
  }
}

/**
 * Persists updated usage history to JSON files.
 */
export async function saveHistory(historyDir, updatedDays, state) {
  for (const dStr of updatedDays) {
    await fs.writeFile(`${historyDir}/usage_${dStr}.json`, JSON.stringify({
      date: dStr, updatedAt: new Date().toISOString(), stats: state.daily_stats[dStr], spikes: state.spikes[dStr]
    }, null, 2));
  }
}
