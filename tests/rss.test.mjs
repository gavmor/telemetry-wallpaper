import { describe, it, expect } from 'vitest';
import { renderTelemetryRSS } from '../src/rss.mjs';

describe('RSS Feed Generation', () => {
  const todayStr = '2026-02-22';
  const now = new Date('2026-02-22T12:00:00Z');

  it('should render a valid Variety-compatible RSS feed via abstraction', () => {
    const rss = renderTelemetryRSS({ todayStr, now });
    
    expect(rss).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
    expect(rss).toContain('OpenClaw Feed Builder');
    expect(rss).toContain('medium="image"');
    expect(rss).toContain('type="image/png"');
  });

  it('should include the latest telemetry chart item with extensions', () => {
    const rss = renderTelemetryRSS({ todayStr, now }, { filename: 'chart_123.png' });
    
    expect(rss).toContain('Latest Telemetry Chart');
    expect(rss).toContain('http://127.0.0.1:18789/api/telemetry/chart_123.png');
    expect(rss).toContain('media:content');
  });

  it('should inject gateway token into URLs if provided', () => {
    const rss = renderTelemetryRSS({ todayStr, now }, { token: 'secret-token' });
    expect(rss).toContain('?token=secret-token');
    expect(rss).toContain('http://127.0.0.1:18789/api/telemetry/usage_telemetry.png?token=secret-token');
  });
});
