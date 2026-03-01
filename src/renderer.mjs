/**
 * Pure functional SVG renderer for telemetry data.
 * Consumes structured usage data and returns an SVG string.
 */
export function renderUsageSVG(data, options = {}) {
  const {
    resolution = '1920x1080',
    title: customTitle = 'Token Usage',
    theme = 'gruvbox-dark'
  } = options;

  const { stats = {}, spikes = [], date = new Date().toISOString().split('T')[0] } = data;

  // 1. Prepare Time Intervals (Fixed 96 * 15m)
  const todayDt = new Date(date);
  todayDt.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  
  const fixedIntervals = [];
  for (let i = 0; i < 96; i++) {
    const d = new Date(todayDt.getTime() + (i * 15 * 60 * 1000));
    fixedIntervals.push(`${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  // 2. Identify Models
  const models = new Set();
  for (const interval of Object.values(stats)) {
    for (const m of Object.keys(interval)) models.add(m);
  }
  const sortedModels = Array.from(models).sort();
  if (sortedModels.length === 0) sortedModels.push('no-data');

  // 3. Define Series (Cache + Active per model)
  const seriesLabels = [];
  const seriesColors = [];
  const seriesData = [];

  const BG = "#282828"; const FG = "#ebdbb2"; const GRAY = "#928374"; const GRID = "#3c3836";

  const hslToHex = (h, s, l) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const getModelColor = (fullId) => {
    const [provider, ...rest] = fullId.split('/');
    const modelName = rest.join('/');

    // 1. Assign a base hue per provider (radically different regions)
    const PROVIDER_HUES = {
      'anthropic': 220, // Blue
      'google': 45,     // Yellow/Gold
      'openai': 150,    // Green
      'ollama': 280,    // Purple
      'mistral': 190,   // Aqua
      'ch-dot-at': 10   // Red/Orange
    };

    let baseHue;
    if (PROVIDER_HUES[provider.toLowerCase()]) {
      baseHue = PROVIDER_HUES[provider.toLowerCase()];
    } else {
      // Hash provider name for unknown providers
      let pHash = 0;
      for (let i = 0; i < provider.length; i++) {
        pHash = provider.charCodeAt(i) + ((pHash << 5) - pHash);
      }
      baseHue = Math.abs(pHash % 360);
    }

    // 2. Differentiate models within the provider's region (+/- 20 degrees)
    let mHash = 0;
    for (let i = 0; i < modelName.length; i++) {
      mHash = modelName.charCodeAt(i) + ((mHash << 5) - mHash);
    }
    const offset = (mHash % 40) - 20; 
    const finalHue = (baseHue + offset + 360) % 360;
    
    return {
      active: hslToHex(finalHue, 75, 60),
      cache: hslToHex(finalHue, 45, 35)
    };
  };

  for (let i = 0; i < sortedModels.length; i++) {
    const fullId = sortedModels[i];
    const colors = getModelColor(fullId);
    const hasCache = fixedIntervals.some(inv => (stats[inv]?.[fullId]?.cache || 0) > 0);
    
    if (hasCache) {
      seriesLabels.push(`${fullId} (Cache)`);
      seriesColors.push(colors.cache);
      seriesData.push(fixedIntervals.map(inv => stats[inv]?.[fullId]?.cache || 0));
    }
    seriesLabels.push(`${fullId} (Active)`);
    seriesColors.push(colors.active);
    seriesData.push(fixedIntervals.map(inv => stats[inv]?.[fullId]?.active || 0));
  }

  // 4. Calculate Stacks
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

  // 5. Scaling Logic
  const maxVal = (stacks.length > 0) ? Math.max(...stacks[stacks.length - 1], 1000) : 1000;
  const [resW, resH] = resolution.split('x').map(Number);
  const marginL = 120; const marginR = 150; const marginT = 100; const marginB = 150;
  const chartW = resW - marginL - marginR; const chartH = resH - marginT - marginB;

  const adjMax = Math.ceil(maxVal / 100000) * 100000 || 100000;
  const scaleX = (i) => marginL + (i / 95) * chartW;
  const scaleY = (v) => resH - marginB - (v / adjMax) * chartH;

  const FONT = "monospace";

  // 6. Build SVG
  let svg = `<svg width="${resW}" height="${resH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="${BG}" />`;
  
  // Calculate Totals for Title
  let totalActive = 0;
  let totalCache = 0;
  Object.values(stats).forEach(interval => {
    Object.values(interval).forEach(m => {
      totalActive += (m.active || 0);
      totalCache += (m.cache || 0);
    });
  });
  const totalTokens = totalActive + totalCache;

  // Debug Proofing Mark (Large and obvious to prove refresh)
  if (options.debug) {
    const now = new Date();
    const isEven = now.getSeconds() % 2 === 0;
    const markColor = isEven ? "#fb4934" : "#b8bb26"; // Gruvbox Red / Green
    const markX = resW - 150;
    const markY = resH - 150;
    svg += `<rect x="${markX}" y="${markY}" width="120" height="120" fill="${markColor}" />`;
    svg += `<text x="${markX + 60}" y="${markY + 75}" font-family="${FONT}" font-size="60" font-weight="bold" fill="#282828" text-anchor="middle">${now.getSeconds()}</text>`;
    svg += `<text x="${resW - 90}" y="${markY - 15}" font-family="${FONT}" font-size="16" font-weight="bold" fill="${FG}" text-anchor="middle">DEBUG ACTIVE</text>`;
  }

  // Format title without UTC slipping (YYYY-MM-DD -> Local readable)
  const [y, m, d] = date.split('-').map(Number);
  const titleDate = new Date(y, m - 1, d);
  const dateStr = titleDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  const title = `${customTitle}: ${dateStr}`;
  const subtitle = `Total: ${totalTokens.toLocaleString()} | Active: ${totalActive.toLocaleString()} | Cached: ${totalCache.toLocaleString()}`;
  
  svg += `<text x="${marginL + chartW/2}" y="50" font-family="${FONT}" font-size="32" font-weight="bold" text-anchor="middle" fill="${FG}">${title}</text>`;
  svg += `<text x="${marginL + chartW/2}" y="85" font-family="${FONT}" font-size="18" font-weight="normal" text-anchor="middle" fill="${GRAY}">${subtitle}</text>`;

  // Y-Axis
  [0, adjMax / 2, adjMax].forEach(tick => {
    const y = scaleY(tick);
    svg += `<line x1="${marginL}" y1="${y}" x2="${marginL + chartW}" y2="${y}" stroke="${GRID}" stroke-width="1" />`;
    svg += `<text x="${marginL - 15}" y="${y + 4}" font-family="${FONT}" font-size="12" text-anchor="end" fill="${GRAY}">${tick.toLocaleString()}</text>`;
  });

  // Areas
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

  // Legend
  seriesLabels.forEach((lab, i) => {
    const yP = marginT + i * 20;
    const op = lab.includes('Cache') ? "0.3" : "0.8";
    svg += `<rect x="${resW - 300}" y="${yP}" width="10" height="10" fill="${seriesColors[i]}" opacity="${op}" />`;
    svg += `<text x="${resW - 285}" y="${yP + 10}" font-family="${FONT}" font-size="12" fill="${FG}">${lab}</text>`;
  });

  // Spikes
  let lastLabelX = -100;
  spikes.forEach(spike => {
    const idx = fixedIntervals.indexOf(spike.interval);
    if (idx === -1) return;
    const x = scaleX(idx);
    const total = sortedModels.reduce((acc, m) => acc + (stats[spike.interval]?.[m]?.active || 0) + (stats[spike.interval]?.[m]?.cache || 0), 0);
    const y = scaleY(total);
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="white" />`;
    const yOff = (x - lastLabelX) > 100 ? -15 : -30;
    lastLabelX = x;
    svg += `<text x="${x}" y="${y + yOff}" font-family="${FONT}" font-size="10" fill="${FG}" text-anchor="middle">${spike.channel}</text>`;
  });

  // X-Axis
  for (let i = 0; i < 96; i += 8) {
    const lbl = fixedIntervals[i].split(' ')[1];
    const x = scaleX(i);
    const y = resH - marginB + 30;
    svg += `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" text-anchor="middle" transform="rotate(35, ${x}, ${y})" fill="${GRAY}">${lbl}</text>`;
  }

  svg += `</svg>`;
  return svg;
}
