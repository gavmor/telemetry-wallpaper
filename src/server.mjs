import fs from 'node:fs/promises';
import path from 'node:path';
import { runTelemetry } from './telemetry.mjs';

/**
 * Handles HTTP requests to serve the telemetry SVG, PNG, and RSS feed.
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
    const content = isDebug 
      ? await runTelemetry(api, { 
          debug: true, 
          format: pathName.endsWith('.xml') ? 'rss' : (pathName.endsWith('.svg') ? 'svg' : 'png') 
        }) 
      : await fs.readFile(path.join(OPENCLAW_DIR, route.file));

    res.writeHead(200, { 'Content-Type': route?.type || (pathName.endsWith('.svg') ? 'image/svg+xml' : 'image/png'), 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch (e) {
    res.statusCode = 404;
    res.end('Asset not found');
  }
  return true;
}
