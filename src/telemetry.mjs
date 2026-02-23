import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function runTelemetry(api) {
  // 1. Robust Path Resolution
  const HOME_DIR = process.env.HOME || '/home/user';
  let OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
  
  if (typeof api.getPaths === 'function') {
    OPENCLAW_DIR = api.getPaths().stateDir;
  } else if (typeof api.runtime?.state?.resolveStateDir === 'function') {
    OPENCLAW_DIR = api.runtime.state.resolveStateDir();
  }

  const SESSIONS_DIR = path.join(OPENCLAW_DIR, 'agents/main/sessions');
  const SESSIONS_CONFIG = path.join(SESSIONS_DIR, 'sessions.json');
  const HISTORY_DIR = path.join(OPENCLAW_DIR, 'usage_history');
  const STATE_PATH = path.join(HISTORY_DIR, 'process_state.json');
  
  const pluginCfg = api.pluginConfig || {};
  const SPIKE_THRESHOLD = Number(pluginCfg.spikeThreshold || 50000);
  const RESOLUTION = pluginCfg.resolution || '1920x1080';
  
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  // 2. Load Session Metadata
  const sessionMetadata = {};
  try {
    const rawSessions = JSON.parse(await fs.readFile(SESSIONS_CONFIG, 'utf8'));
    for (const [_key, val] of Object.entries(rawSessions)) {
      const sid = val.sessionId;
      if (sid) {
        const origin = val.origin || {};
        const label = origin.label || 'unknown';
        const provider = origin.provider || 'local';
        sessionMetadata[sid] = `${provider}/${label}`;
      }
    }
  } catch (_err) {}

  // 3. Load State
  let state = { cursors: {}, daily_stats: {}, spikes: {} };
  try {
    const rawState = await fs.readFile(STATE_PATH, 'utf8');
    state = JSON.parse(rawState);
  } catch (_err) {}

  // 4. Incremental Processing
  let files = [];
  try {
    files = (await fs.readdir(SESSIONS_DIR)).filter(f => f.endsWith('.jsonl'));
  } catch (_err) {}
  
  const updatedDays = new Set();

  for (const filename of files) {
    const filePath = path.join(SESSIONS_DIR, filename);
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch(_e) { continue; }
    
    const currentSize = stats.size;
    let lastOffset = state.cursors[filename] || 0;

    if (currentSize < lastOffset) lastOffset = 0;
    if (currentSize <= lastOffset) continue;

    const fd = await fs.open(filePath, 'r');
    const length = currentSize - lastOffset;
    const buffer = Buffer.alloc(length);
    await fd.read(buffer, 0, length, lastOffset);
    await fd.close();

    const newContent = buffer.toString('utf8');
    const lines = newContent.split('\n').filter(l => l.trim());
    
    let sessionId = filename.replace('.jsonl', '');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'session') sessionId = entry.id || sessionId;
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message;
          if (msg.usage) {
            // FIX: Use proper local date formatting instead of ISO split (which is always UTC)
            const dt = new Date(entry.timestamp);
            
            // Generate local-aware keys
            const pad = (n) => String(n).padStart(2, '0');
            const dayStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
            const minute = Math.floor(dt.getMinutes() / 15) * 15;
            const intervalStr = `${dayStr} ${pad(dt.getHours())}:${pad(minute)}`;
            
            const provider = msg.provider || 'unknown';
            const model = msg.model || 'unknown';
            const fullId = `${provider}/${model}`;
            
            const usage = msg.usage;
            const active = (usage.input || 0) + (usage.output || 0);
            const cache = (usage.cacheRead || 0) + (usage.cacheWrite || 0);
            let total = active + cache;
            if (total === 0) total = usage.totalTokens || 0;

            if (!state.daily_stats[dayStr]) state.daily_stats[dayStr] = {};
            if (!state.daily_stats[dayStr][intervalStr]) state.daily_stats[dayStr][intervalStr] = {};
            if (!state.daily_stats[dayStr][intervalStr][fullId]) state.daily_stats[dayStr][intervalStr][fullId] = { active: 0, cache: 0 };
            
            state.daily_stats[dayStr][intervalStr][fullId].active += active;
            state.daily_stats[dayStr][intervalStr][fullId].cache += cache;
            updatedDays.add(dayStr);

            if (total > SPIKE_THRESHOLD) {
              if (!state.spikes[dayStr]) state.spikes[dayStr] = [];
              const channelCtx = sessionMetadata[sessionId] || 'unknown/system';
              state.spikes[dayStr].push({
                timestamp: entry.timestamp,
                interval: intervalStr,
                model: fullId,
                tokens: total,
                channel: channelCtx
              });
            }
          }
        }
      } catch (_err) {}
    }
    state.cursors[filename] = currentSize;
  }

  const allDays = Object.keys(state.daily_stats).sort();
  if (allDays.length > 7) {
    for (const oldDay of allDays.slice(0, -7)) {
      delete state.daily_stats[oldDay];
      delete state.spikes[oldDay];
    }
  }

  await fs.writeFile(STATE_PATH, JSON.stringify(state));

  for (const dStr of updatedDays) {
    const historyPath = path.join(HISTORY_DIR, `usage_${dStr}.json`);
    await fs.writeFile(historyPath, JSON.stringify({
      date: dStr,
      updatedAt: new Date().toISOString(),
      stats: state.daily_stats[dStr] || {},
      spikes: state.spikes[dStr] || []
    }, null, 2));
  }

  // 6. SVG Rendering
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  
  const todayDt = new Date(now);
  todayDt.setHours(0, 0, 0, 0);
  
  const fixedIntervals = [];
  for (let i = 0; i < 96; i++) {
    const d = new Date(todayDt.getTime() + (i * 15 * 60 * 1000));
    fixedIntervals.push(`${todayStr} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  const todayData = state.daily_stats[todayStr] || {};
  const todaySpikes = state.spikes[todayStr] || [];
  const modelsToday = new Set();
  for (const interval of Object.values(todayData)) {
    for (const m of Object.keys(interval)) modelsToday.add(m);
  }
  const sortedModels = Array.from(modelsToday).sort();
  if (sortedModels.length === 0) sortedModels.push('no-data');

  const seriesLabels = [];
  const seriesColors = [];
  const seriesData = [];

  const BG = "#282828"; const FG = "#ebdbb2"; const GRAY = "#928374"; const GRID = "#3c3836";
  const ACTIVE_COLORS = ["#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#fe8019"];
  const CACHE_COLORS  = ["#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#d65d0e"];

  for (let i = 0; i < sortedModels.length; i++) {
    const fullId = sortedModels[i];
    const colorIdx = i % ACTIVE_COLORS.length;
    const hasCache = fixedIntervals.some(inv => (todayData[inv]?.[fullId]?.cache || 0) > 0);
    
    if (hasCache) {
      seriesLabels.push(`${fullId} (Cache)`);
      seriesColors.push(CACHE_COLORS[colorIdx]);
      seriesData.push(fixedIntervals.map(inv => todayData[inv]?.[fullId]?.cache || 0));
    }
    seriesLabels.push(`${fullId} (Active)`);
    seriesColors.push(ACTIVE_COLORS[colorIdx]);
    seriesData.push(fixedIntervals.map(inv => todayData[inv]?.[fullId]?.active || 0));
  }

  const stacks = [];
  for (let sIdx = 0; sIdx < seriesLabels.length; sIdx++) {
    const row = [];
    for (let hIdx = 0; hIdx < 96; hIdx++) {
      let val = seriesData[sIdx][hIdx];
      if (sIdx > 0) val += stacks[sIdx - 1][hIdx];
      row.push(val);
    }
    stacks.push(row);
  }

  const maxVal = (stacks.length > 0) ? Math.max(...stacks[stacks.length - 1], 1000) : 1000;
  const [resW, resH] = RESOLUTION.split('x').map(Number);
  const marginL = 120; const marginR = 150; const marginT = 100; const marginB = 150;
  const chartW = resW - marginL - marginR; const chartH = resH - marginT - marginB;

  const adjMax = Math.ceil(maxVal / 100000) * 100000 || 100000;
  const scaleX = (i) => marginL + (i / 95) * chartW;
  const scaleY = (v) => resH - marginB - (v / adjMax) * chartH;

  let svg = `<svg width="${resW}" height="${resH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="${BG}" />`;
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  const title = `Token Usage: ${now.toLocaleDateString('en-US', dateOptions)}`;
  svg += `<text x="${marginL + chartW/2}" y="60" font-family="monospace" font-size="32" font-weight="bold" text-anchor="middle" fill="${FG}">${title}</text>`;

  for (const tick of [0, adjMax / 2, adjMax]) {
    const y = scaleY(tick);
    svg += `<line x1="${marginL}" y1="${y}" x2="${marginL + chartW}" y2="${y}" stroke="${GRID}" stroke-width="1" />`;
    svg += `<text x="${marginL - 15}" y="${y + 4}" font-family="monospace" font-size="12" text-anchor="end" fill="${GRAY}">${tick.toLocaleString()}</text>`;
  }

  for (let idx = seriesLabels.length - 1; idx >= 0; idx--) {
    const points = [];
    for (let i = 0; i < 96; i++) points.push(`${scaleX(i)},${scaleY(stacks[idx][i])}`);
    if (idx > 0) {
      for (let i = 95; i >= 0; i--) points.push(`${scaleX(i)},${scaleY(stacks[idx - 1][i])}`);
    } else {
      points.push(`${scaleX(95)},${resH - marginB}`);
      points.push(`${scaleX(0)},${resH - marginB}`);
    }
    const op = seriesLabels[idx].includes('Cache') ? "0.3" : "0.8";
    svg += `<polygon points="${points.join(' ')}" fill="${seriesColors[idx]}" opacity="${op}" />`;
  }

  seriesLabels.forEach((lab, i) => {
    const yP = marginT + i * 20;
    const op = lab.includes('Cache') ? "0.3" : "0.8";
    svg += `<rect x="${resW - 300}" y="${yP}" width="10" height="10" fill="${seriesColors[i]}" opacity="${op}" />`;
    svg += `<text x="${resW - 285}" y="${yP + 10}" font-family="monospace" font-size="12" fill="${FG}">${lab}</text>`;
  });

  let lastLabelX = -100;
  todaySpikes.forEach(spike => {
    const idx = fixedIntervals.indexOf(spike.interval);
    if (idx === -1) return;
    const x = scaleX(idx);
    const total = sortedModels.reduce((acc, m) => acc + (todayData[spike.interval]?.[m]?.active || 0) + (todayData[spike.interval]?.[m]?.cache || 0), 0);
    const y = scaleY(total);
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="white" />`;
    const yOff = (x - lastLabelX) > 100 ? -15 : -30;
    lastLabelX = x;
    svg += `<text x="${x}" y="${y + yOff}" font-family="monospace" font-size="10" fill="${FG}" text-anchor="middle">${spike.channel}</text>`;
  });

  for (let i = 0; i < 96; i += 8) {
    const lbl = fixedIntervals[i].split(' ')[1];
    const x = scaleX(i);
    svg += `<text x="${x}" y="${resH - marginB + 30}" font-family="monospace" font-size="12" text-anchor="middle" transform="rotate(35, {x}, {resH - marginB + 30})" fill="${GRAY}">${lbl}</text>`;
  }

  svg += `</svg>`;
  const svgPath = path.join(OPENCLAW_DIR, 'hourly_model_usage.svg');
  await fs.writeFile(svgPath, svg);

  try {
    await execAsync(`/usr/bin/gsettings set org.cinnamon.desktop.background picture-uri "file://${svgPath}"`);
    await execAsync(`/usr/bin/gsettings set org.cinnamon.desktop.background picture-options "scaled"`);
  } catch (_err) {}
}
