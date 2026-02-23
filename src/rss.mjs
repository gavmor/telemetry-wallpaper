import RSS from 'rss';

/**
 * RSS Feed Generator for Telemetry using the 'rss' library.
 * Handles Variety compatibility (media:content) and XML namespaces.
 */
export function renderTelemetryRSS({ todayStr, spikes, now = new Date() }, options = {}) {
  const chartUrlBase = options.chartUrlBase || 'http://localhost:18789/api/telemetry/chart.svg';
  const chartUrl = `${chartUrlBase}?t=${now.getTime()}`;
  const width = options.width || "1920";
  const height = options.height || "1080";
  
  const feed = new RSS({
    title: "OpenClaw Telemetry",
    description: "Real-time token usage and spikes",
    feed_url: "http://localhost:18789/api/telemetry/feed.xml",
    site_url: "http://localhost:18789",
    language: "en",
    pubDate: now,
    custom_namespaces: {
      'media': 'http://search.yahoo.com/mrss/'
    }
  });

  const mediaContent = {
    'media:content': {
      _attr: {
        url: chartUrl,
        type: 'image/svg+xml',
        medium: 'image',
        width,
        height
      }
    }
  };

  // 1. Add the Chart Item
  feed.item({
    title: "Latest Telemetry Chart",
    description: "The current usage visualization SVG",
    url: chartUrl,
    date: now,
    guid: `chart-${todayStr}-${Math.floor(now.getTime() / (15 * 60 * 1000))}`,
    custom_elements: [mediaContent]
  });

  // 2. Add Spike Items
  const recentSpikes = (spikes || []).slice(-10).reverse();
  
  recentSpikes.forEach(s => {
    feed.item({
      title: `Usage Spike: ${s.tokens.toLocaleString()} tokens`,
      description: `Model: ${s.model} | Channel: ${s.channel}`,
      url: chartUrl,
      date: new Date(s.timestamp),
      guid: `${s.timestamp}-${s.tokens}`,
      custom_elements: [mediaContent]
    });
  });

  return feed.xml({ indent: true });
}
