import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderUsageSVG } from './renderer.mjs';
import { renderTelemetryRSS } from './rss.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Conditional import for canvas - keep static to avoid re-registration
let createCanvas, loadImage, GlobalFonts;
let fontsInitialized = false;

async function initFonts() {
  if (fontsInitialized) return;
  try {
    const canvas = await import('@napi-rs/canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
    GlobalFonts = canvas.GlobalFonts;

    const bundledFont = path.join(__dirname, '../assets/JetBrainsMono.ttf');
    try {
      await fs.access(bundledFont);
      // Register under multiple aliases just in case
      GlobalFonts.registerFromPath(bundledFont, 'JetBrains Mono');
      GlobalFonts.registerFromPath(bundledFont, 'monospace');
      console.log(`telemetry-collector: registered JetBrains Mono from ${bundledFont}`);
      console.log('telemetry-collector: available fonts:', GlobalFonts.families.map(f => f.family).join(', '));
      fontsInitialized = true;
    } catch (e) {
      console.error('telemetry-collector: Bundled font not accessible', e);
    }
  } catch (e) {
    console.warn('telemetry-collector: @napi-rs/canvas not found');
  }
}

/**
 * Data Collector & Orchestrator.
 */
export async function runTelemetry(api, options = {}) {
  await initFonts();

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
    theme: pluginCfg.theme,
    debug: options.debug
  });

  const svgPath = path.join(OPENCLAW_DIR, 'usage_telemetry.svg');
  if (!options.debug) await fs.writeFile(svgPath, svg);

  const timestamp = Math.floor(now.getTime() / 1000);
  let latestPngName = 'usage_telemetry.png';

  const [w, h] = (pluginCfg.resolution || '1920x1080').split('x').map(Number);

  // Variety fix: Render to PNG with unique filename
  if (createCanvas) {
    try {
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      
      const img = await loadImage(Buffer.from(svg));
      ctx.drawImage(img, 0, 0, w, h);
      
      const buffer = canvas.toBuffer('image/png');
      latestPngName = `chart_${timestamp}.png`;
      
      if (options.debug) return buffer; // Return buffer directly for HTTP debug request

      // Save primary artifact
      await fs.writeFile(path.join(OPENCLAW_DIR, 'usage_telemetry.png'), buffer);
      
      // Mirror to wallpaper dir with unique name for Variety discovery
      const wallDir = path.join(OPENCLAW_DIR, 'wallpaper');
      await fs.mkdir(wallDir, { recursive: true });
      
      // Cleanup old charts
      const oldFiles = await fs.readdir(wallDir);
      for (const file of oldFiles) {
        if (file.startsWith('chart_') && file.endsWith('.png')) {
          await fs.unlink(path.join(wallDir, file));
        }
      }
      
      await fs.writeFile(path.join(wallDir, latestPngName), buffer);
    } catch (e) {
      console.error('telemetry-collector: PNG rendering failed', e);
    }
  }
  
  // Variety-compatible Media RSS Feed
  const rssPath = path.join(OPENCLAW_DIR, 'telemetry_feed.xml');
  const rss = renderTelemetryRSS({
    todayStr,
    spikes: state.spikes[todayStr] || [],
    now
  }, {
    filename: latestPngName,
    width: String(w),
    height: String(h)
  });
  await fs.writeFile(rssPath, rss);

  if (typeof api.emit === 'function') {
    api.emit('telemetry:updated', { path: svgPath, rssPath });
  }
}

/**
 * Handles HTTP requests to serve the telemetry SVG and RSS feed.
 */
export async function handleTelemetryHttpRequest(req, res, api) {
  const OPENCLAW_DIR = path.join(process.env.HOME || '/home/user', '.openclaw');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const isDebug = url.searchParams.get('debug') === 'true';
  const pathName = url.pathname;

  if (req.method !== 'GET') return false;

  const routes = {
    '/api/telemetry/chart.svg': { file: 'usage_telemetry.svg', type: 'image/svg+xml' },
    '/api/telemetry/feed.xml':  { file: 'telemetry_feed.xml',  type: 'application/rss+xml' },
    '/api/telemetry/chart.png': { file: 'usage_telemetry.png', type: 'image/png' }
  };

  const route = routes[pathName] || (pathName.endsWith('.png') ? { file: 'usage_telemetry.png', type: 'image/png' } : null);
  if (!route && !isDebug) return false;

  try {
    const content = (isDebug && pathName.includes('chart')) 
      ? await runTelemetry(api, { debug: true }) 
      : await fs.readFile(path.join(OPENCLAW_DIR, route.file));

    res.writeHead(200, { 'Content-Type': route?.type || 'image/png', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch (e) {
    res.statusCode = 404;
    res.end('Asset not found');
  }
  return true;
}
