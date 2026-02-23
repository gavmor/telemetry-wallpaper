import fs from 'node:fs/promises';
import { renderUsageSVG } from './renderer.mjs';
import { renderTelemetryRSS } from './rss.mjs';
import { processLogLines } from './processor.mjs';
import { resolvePaths } from './paths.mjs';
import { loadSessionMetadata, loadState, saveHistory } from './storage.mjs';
import { renderPNG } from './canvas.mjs';

/**
 * Data Collector & Orchestrator.
 */
export async function runTelemetry(api, options = {}) {
  const paths = resolvePaths(api);
  const cfg = api.pluginConfig || {};
  const spikeThreshold = Number(cfg.spikeThreshold || 50000);

  // 1. Initial Data Loading
  const sessionMetadata = await loadSessionMetadata(paths.sessionsConfig);
  const state = await loadState(paths.state);
  const logFiles = (await fs.readdir(paths.sessions)).filter(f => f.endsWith('.jsonl'));
  
  await fs.mkdir(paths.history, { recursive: true });

  // 2. Incremental Processing
  const updatedDays = new Set();
  for (const filename of logFiles) {
    const filePath = `${paths.sessions}/${filename}`;
    let stats;
    try { stats = await fs.stat(filePath); } catch(e) { continue; }
    
    let lastOffset = state.cursors[filename] || 0;
    if (stats.size < lastOffset) lastOffset = 0;
    if (stats.size <= lastOffset) continue;

    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(stats.size - lastOffset);
    await fd.read(buffer, 0, buffer.length, lastOffset);
    await fd.close();

    const { updatedDays: fileDays } = processLogLines(
      buffer.toString('utf8').split('\n'),
      state,
      { sessionMetadata, spikeThreshold, initialSessionId: filename.replace('.jsonl', '') }
    );
    fileDays.forEach(d => updatedDays.add(d));
    state.cursors[filename] = stats.size;
  }

  // 3. Persistence & History Update
  await fs.writeFile(paths.state, JSON.stringify(state));
  await saveHistory(paths.history, updatedDays, state);

  // 4. Content Generation
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const chartData = { date: dStr, stats: state.daily_stats[dStr] || {}, spikes: state.spikes[dStr] || [] };
  
  const svg = renderUsageSVG(chartData, { resolution: cfg.resolution, theme: cfg.theme, debug: options.debug });
  if (!options.debug) await fs.writeFile(paths.svg, svg);

  // 5. Artifact Rendering
  const latestPngName = await renderPNG(svg, paths, { resolution: cfg.resolution, isDebug: options.debug });
  if (options.debug && Buffer.isBuffer(latestPngName)) return latestPngName;

  const rss = renderTelemetryRSS(
    { todayStr: dStr, spikes: state.spikes[dStr] || [], now },
    { filename: latestPngName || 'usage_telemetry.png', width: (cfg.resolution || '1920x1080').split('x')[0] }
  );
  await fs.writeFile(paths.rss, rss);

  if (typeof api.emit === 'function') {
    api.emit('telemetry:updated', { path: paths.svg, rssPath: paths.rss });
  }
}
