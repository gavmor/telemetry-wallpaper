/**
 * Log Processor for Telemetry.
 * Extracts usage stats and spikes from session log lines.
 */
export function processLogLines(lines, state, context = {}) {
  const { sessionMetadata = {}, spikeThreshold = 50000, initialSessionId = 'unknown' } = context;
  const updatedDays = new Set();
  let sessionId = initialSessionId;

  for (const line of lines) {
    try {
      if (!line.trim()) continue;
      const entry = typeof line === 'string' ? JSON.parse(line) : line;
      
      if (entry.type === 'session') {
        sessionId = entry.id || sessionId;
        continue;
      }
      
      if (entry.type === 'message' && entry.message?.usage) {
        const msg = entry.message;
        const dt = new Date(entry.timestamp);
        const pad = (n) => String(n).padStart(2, '0');
        const dStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        const intervalStr = `${dStr} ${pad(dt.getHours())}:${pad(Math.floor(dt.getMinutes() / 15) * 15)}`;
        const fullId = `${msg.provider || 'unknown'}/${msg.model || 'unknown'}`;
        
        const active = (msg.usage.input || 0) + (msg.usage.output || 0);
        const cache = (msg.usage.cacheRead || 0) + (msg.usage.cacheWrite || 0);
        const total = active + cache || msg.usage.totalTokens || 0;

        state.daily_stats[dStr] ??= {};
        state.daily_stats[dStr][intervalStr] ??= {};
        state.daily_stats[dStr][intervalStr][fullId] ??= { active: 0, cache: 0 };
        
        state.daily_stats[dStr][intervalStr][fullId].active += active;
        state.daily_stats[dStr][intervalStr][fullId].cache += cache;
        updatedDays.add(dStr);

        if (total > spikeThreshold) {
          state.spikes[dStr] ??= [];
          state.spikes[dStr].push({ 
            timestamp: entry.timestamp, 
            interval: intervalStr, 
            model: fullId, 
            tokens: total, 
            channel: sessionMetadata[sessionId] || 'unknown' 
          });
        }
      }
    } catch (e) {
      // Ignore malformed lines
    }
  }
  
  return { updatedDays, lastSessionId: sessionId };
}
