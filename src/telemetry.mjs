import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderUsageSVG } from './renderer.mjs';
import { renderTelemetryRSS } from './rss.mjs';
import { processLogLines } from './processor.mjs';

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
      GlobalFonts.registerFromPath(bundledFont, 'JetBrains Mono');
      GlobalFonts.registerFromPath(bundledFont, 'monospace');
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

    const { updatedDays: fileDays } = processLogLines(
      buffer.toString('utf8').split('\n'),
      state,
      { sessionMetadata, spikeThreshold: SPIKE_THRESHOLD, initialSessionId: filename.replace('.jsonl', '') }
    );
    fileDays.forEach(d => updatedDays.add(d));
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

  if (createCanvas) {
    try {
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      const img = await loadImage(Buffer.from(svg));
      ctx.drawImage(img, 0, 0, w, h);
      const buffer = canvas.toBuffer('image/png');
      latestPngName = `chart_${timestamp}.png`;
      if (options.debug) return buffer;
      await fs.writeFile(path.join(OPENCLAW_DIR, 'usage_telemetry.png'), buffer);
      const wallDir = path.join(OPENCLAW_DIR, 'wallpaper');
      await fs.mkdir(wallDir, { recursive: true });
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
