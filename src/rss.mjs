import { Feed } from 'feed';

/**
 * RSS Feed Generator for Telemetry using the 'feed' library.
 * Handles Variety compatibility (media:content) and XML namespaces.
 */
export function renderTelemetryRSS({ todayStr, spikes, now = new Date() }, options = {}) {
  const filename = options.filename || 'usage_telemetry.png';
  const chartUrlBase = options.chartUrlBase || `http://localhost:18789/api/telemetry/${filename}`;
  const width = options.width || "1920";
  const height = options.height || "1080";
  
  const feed = new Feed({
    title: "OpenClaw Telemetry",
    description: "Real-time token usage and spikes",
    id: "http://localhost:18789/",
    link: "http://localhost:18789/",
    language: "en",
    updated: now,
    generator: "OpenClaw Feed Builder",
  });

  // 1. Add the Chart Item
  feed.addItem({
    title: "Latest Telemetry Chart",
    description: "The current usage visualization PNG",
    link: chartUrlBase,
    date: now,
    guid: `chart-${todayStr}-${Math.floor(now.getTime() / (15 * 60 * 1000))}`,
    extensions: [
      {
        name: "media:content",
        attributes: {
          url: chartUrlBase,
          type: "image/png",
          medium: "image",
          width,
          height
        }
      },
      {
        name: "enclosure",
        attributes: {
          url: chartUrlBase,
          type: "image/png",
          length: "0"
        }
      }
    ]
  });

  // 2. Add Spike Items
  const recentSpikes = (spikes || []).slice(-10).reverse();
  
  recentSpikes.forEach(s => {
    feed.addItem({
      title: `Usage Spike: ${s.tokens.toLocaleString()} tokens`,
      description: `Model: ${s.model} | Channel: ${s.channel}`,
      link: chartUrlBase,
      date: new Date(s.timestamp),
      guid: `${s.timestamp}-${s.tokens}`,
      extensions: [
        {
          name: "media:content",
          attributes: {
            url: chartUrlBase,
            type: "image/png",
            medium: "image",
            width,
            height
          }
        },
        {
          name: "enclosure",
          attributes: {
            url: chartUrlBase,
            type: "image/png",
            length: "0"
          }
        }
      ]
    });
  });

  let rss = feed.rss2();
  // Ensure the media namespace is present
  if (!rss.includes('xmlns:media')) {
    rss = rss.replace('<rss version="2.0">', '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">');
  }
  return rss;
}
