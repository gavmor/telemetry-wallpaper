import RSS from 'rss';

/**
 * RSS Feed Generator for Telemetry using the 'rss' library.
 * High-level abstraction with robust attribute support for MediaRSS.
 */
export function renderTelemetryRSS({ todayStr, spikes, now = new Date() }, options = {}) {
  const filename = options.filename || 'usage_telemetry.png';
  const token = options.token ? `?token=${options.token}` : '';
  const chartUrl = options.chartUrlBase || `http://127.0.0.1:18789/api/telemetry/${filename}${token}`;
  const width = options.width || "1920";
  const height = options.height || "1080";
  
  const feed = new RSS({
    title: "OpenClaw Telemetry",
    description: "Real-time token usage and spikes",
    feed_url: `http://127.0.0.1:18789/api/telemetry/feed.xml${token}`,
    site_url: "http://127.0.0.1:18789",
    language: "en",
    pubDate: now,
    generator: "OpenClaw Feed Builder",
    custom_namespaces: {
      'media': 'http://search.yahoo.com/mrss/'
    }
  });

  const customElements = [
    {
      'media:content': {
        _attr: {
          url: chartUrl,
          type: 'image/png',
          medium: 'image',
          width,
          height
        }
      }
    },
    {
      'enclosure': {
        _attr: {
          url: chartUrl,
          type: 'image/png',
          length: '0'
        }
      }
    }
  ];

  // 1. Add the Main Chart Item
  feed.item({
    title: "Latest Telemetry Chart",
    description: "The current usage visualization PNG",
    url: chartUrl,
    date: now,
    guid: `chart-${todayStr}-${Math.floor(now.getTime() / (15 * 60 * 1000))}`,
    custom_elements: customElements
  });

  // 2. Add Spike Items
  (spikes || []).slice(-10).reverse().forEach(s => {
    feed.item({
      title: `Usage Spike: ${s.tokens.toLocaleString()} tokens`,
      description: `Model: ${s.model} | Channel: ${s.channel}`,
      url: chartUrl,
      date: new Date(s.timestamp),
      guid: `${s.timestamp}-${s.tokens}`,
      custom_elements: customElements
    });
  });

  return feed.xml({ indent: true });
}
