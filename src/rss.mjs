/**
 * RSS Feed Generator for Telemetry.
 */
export function renderTelemetryRSS({ todayStr, spikes, now = new Date() }, options = {}) {
  const chartUrlBase = options.chartUrlBase || 'http://localhost:18789/api/telemetry/chart.png';
  const chartUrl = `${chartUrlBase}?t=${now.getTime()}`;
  
  const rssItems = (spikes || []).slice(-10).reverse().map(s => `
    <item>
      <title>Usage Spike: ${s.tokens.toLocaleString()} tokens</title>
      <description>Model: ${s.model} | Channel: ${s.channel}</description>
      <pubDate>${new Date(s.timestamp).toUTCString()}</pubDate>
      <link>${chartUrl}</link>
      <media:content url="${chartUrl}" type="image/png" />
      <guid>${s.timestamp}-${s.tokens}</guid>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>OpenClaw Telemetry</title>
  <description>Real-time token usage and spikes</description>
  <link>http://localhost:18789</link>
  <lastBuildDate>${now.toUTCString()}</lastBuildDate>
  <item>
    <title>Latest Telemetry Chart</title>
    <description>The current usage visualization PNG</description>
    <pubDate>${now.toUTCString()}</pubDate>
    <link>${chartUrl}</link>
    <media:content url="${chartUrl}" type="image/png" />
    <guid>chart-${todayStr}-${Math.floor(now.getTime() / (15 * 60 * 1000))}</guid>
  </item>${rssItems}
</channel>
</rss>`;
}
