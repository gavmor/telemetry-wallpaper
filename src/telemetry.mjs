import fs from 'node:fs/promises';
import path from 'node:path';
import { renderUsageSVG } from './renderer.mjs';
import { renderTelemetryRSS } from './rss.mjs';

/**
 * Data Collector & Orchestrator.
 */
export async function runTelemetry(api) {
  const HOME_DIR = process.env.HOME || '/home/user';
  let OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
  if (typeof api.getPaths === 'function') OPENCLAW_DIR = api.getPaths().stateDir;

  const SESSIONS_DIR = path.join(OPENCLAW_DIR, 'agents/main/sessions');
  const SESSIONS_CONFIG = path.join(SESSIONS_DIR, 'sessions.json');
  const HISTORY_DIR = path.join(OPENCLAW_DIR, 'storage/plugins/telemetry-collector');
  const STATE_PATH = path.join(HISTORY_DIR, 'process_state.json');
  
  const pluginCfg = api.pluginConfig || {};
  const SPIKE_THRESHOLD = Number(pluginCfg.spikeThreshold || 50000);
  
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  let sessionMetadata = {};
  try {
    const raw = JSON.parse(await fs.readFile(SESSIONS_CONFIG, 'utf8'));
    for (const [_, val] of Object.entries(raw)) {
      if (val.sessionId) {
        const origin = val.origin || {};
        sessionMetadata[val.sessionId] = `${origin.provider || 'local'}/${origin.label || 'unknown'}`;
      }
    }
  } catch (e) {}

  let state = { cursors: {}, daily_stats: {}, spikes: {} };
  try { state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8')); } catch (e) {}

  let files = [];
  try { files = (await fs.readdir(SESSIONS_DIR)).filter(f => f.endsWith('.jsonl')); } catch (e) {}
  
  const updatedDays = new Set();
  for (const filename of files) {
    const filePath = path.join(SESSIONS_DIR, filename);
    let stats;
    try { stats = await fs.stat(filePath); } catch(e) { continue; }
    
    const currentSize = stats.size;
    let lastOffset = state.cursors[filename] || 0;
    if (currentSize < lastOffset) lastOffset = 0;
    if (currentSize <= lastOffset) continue;

    const fd = await fs.open(filePath, 'r');
    const length = currentSize - lastOffset;
    const buffer = Buffer.alloc(length);
    await fd.read(buffer, 0, length, lastOffset);
    await fd.close();

    const lines = buffer.toString('utf8').split('\n').filter(l => l.trim());
    let sessionId = filename.replace('.jsonl', '');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'session') sessionId = entry.id || sessionId;
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

          if (!state.daily_stats[dStr]) state.daily_stats[dStr] = {};
          if (!state.daily_stats[dStr][intervalStr]) state.daily_stats[dStr][intervalStr] = {};
          if (!state.daily_stats[dStr][intervalStr][fullId]) state.daily_stats[dStr][intervalStr][fullId] = { active: 0, cache: 0 };
          
          state.daily_stats[dStr][intervalStr][fullId].active += active;
          state.daily_stats[dStr][intervalStr][fullId].cache += cache;
          console.log(`telemetry-collector: recorded ${active} tokens for ${fullId} at ${intervalStr}`);
          updatedDays.add(dStr);

          if (total > SPIKE_THRESHOLD) {
            if (!state.spikes[dStr]) state.spikes[dStr] = [];
            state.spikes[dStr].push({ timestamp: entry.timestamp, interval: intervalStr, model: fullId, tokens: total, channel: sessionMetadata[sessionId] || 'unknown' });
          }
        }
      } catch (e) {}
    }
    state.cursors[filename] = currentSize;
  }

  await fs.writeFile(STATE_PATH, JSON.stringify(state));

  for (const dStr of updatedDays) {
    await fs.writeFile(path.join(HISTORY_DIR, `usage_${dStr}.json`), JSON.stringify({
      date: dStr, updatedAt: new Date().toISOString(), stats: state.daily_stats[dStr], spikes: state.spikes[dStr]
    }, null, 2));
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  
  const svg = renderUsageSVG({
    date: todayStr,
    stats: state.daily_stats[todayStr] || {},
    spikes: state.spikes[todayStr] || []
  }, {
    resolution: pluginCfg.resolution,
    theme: pluginCfg.theme
  });

  const svgPath = path.join(OPENCLAW_DIR, 'usage_telemetry.svg');
  await fs.writeFile(svgPath, svg);
  
  // Variety-compatible Media RSS Feed
  const rssPath = path.join(OPENCLAW_DIR, 'telemetry_feed.xml');
  const rss = renderTelemetryRSS({
    todayStr,
    spikes: state.spikes[todayStr] || [],
    now
  });
  await fs.writeFile(rssPath, rss);

  if (typeof api.emit === 'function') {
    api.emit('telemetry:updated', { path: svgPath, rssPath });
  }
}

/**
 * Handles HTTP requests to serve the telemetry SVG and RSS feed.
 */
export async function handleTelemetryHttpRequest(req, res) {
  const HOME_DIR = process.env.HOME || '/home/user';
  const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

  console.log(`telemetry-collector: HTTP request ${req.method} ${req.url}`);

  if (req.method === 'GET') {
    if (req.url.includes('/api/telemetry/chart.svg')) {
      try {
        const content = await fs.readFile(path.join(OPENCLAW_DIR, 'usage_telemetry.svg'));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(content);
        return true;
      } catch (e) {
        res.statusCode = 404; res.end('SVG not found'); return true;
      }
    }
    if (req.url.includes('/api/telemetry/feed.xml')) {
      try {
        const content = await fs.readFile(path.join(OPENCLAW_DIR, 'telemetry_feed.xml'));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/rss+xml');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(content);
        return true;
      } catch (e) {
        res.statusCode = 404; res.end('Feed not found'); return true;
      }
    }
  }
  return false;
}
