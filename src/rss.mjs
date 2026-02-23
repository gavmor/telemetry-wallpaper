/**
 * RSS Feed Generator for Telemetry (Variety-optimized).
 */
export function renderTelemetryRSS({ todayStr, spikes, now = new Date() }, options = {}) {
  const filename = options.filename || 'usage_telemetry.png';
  const baseUrl = options.chartUrlBase || `http://127.0.0.1:18789/api/telemetry/${filename}`;
  
  const rssItems = (spikes || []).slice(-10).reverse().map(s => `
    <item>
      <title>Spike: ${s.tokens.toLocaleString()}</title>
      <link>${baseUrl}</link>
      <media:content url="${baseUrl}" medium="image" type="image/png" />
      <guid isPermaLink="false">${s.timestamp}-${s.tokens}</guid>
      <pubDate>${new Date(s.timestamp).toUTCString()}</pubDate>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>OpenClaw Telemetry</title>
  <link>http://127.0.0.1:18789</link>
  <description>Real-time token usage</description>
  <item>
    <title>Telemetry Chart</title>
    <link>${baseUrl}</link>
    <media:content url="${baseUrl}" medium="image" type="image/png" />
    <guid isPermaLink="false">chart-${todayStr}-${Math.floor(now.getTime() / (15 * 60 * 1000))}</guid>
    <pubDate>${now.toUTCString()}</pubDate>
  </item>${rssItems}
</channel>
</rss>`;
}
