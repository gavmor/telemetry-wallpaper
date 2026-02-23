import { describe, it, expect } from 'vitest';
import { renderTelemetryRSS } from '../src/rss.mjs';

describe('RSS Feed Generation', () => {
  const todayStr = '2026-02-22';
  const now = new Date('2026-02-22T12:00:00Z');
  const spikes = [
    {
      timestamp: '2026-02-22T11:00:00Z',
      tokens: 75000,
      model: 'openai/gpt-4o',
      channel: 'matrix/Gavin'
    }
  ];

  it('should render a valid Variety-compatible RSS feed', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now });
    
    expect(rss).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
    expect(rss).toContain('medium="image"');
    expect(rss).toContain('width="1920"');
    expect(rss).toContain('height="1080"');
  });

  it('should respect custom dimensions', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now }, { width: "3840", height: "2160" });
    expect(rss).toContain('width="3840"');
    expect(rss).toContain('height="2160"');
  });

  it('should handle empty spikes', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes: [], now });
    expect(rss).toContain('<title>Telemetry Chart</title>');
  });
});
