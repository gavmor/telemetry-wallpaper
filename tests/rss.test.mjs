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

  it('should render a valid RSS feed with channel metadata', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now });
    
    expect(rss).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
    expect(rss).toContain('<title>OpenClaw Telemetry</title>');
    expect(rss).toContain('<lastBuildDate>Sun, 22 Feb 2026 12:00:00 GMT</lastBuildDate>');
  });

  it('should include the latest telemetry chart item', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now });
    
    expect(rss).toContain('<title>Latest Telemetry Chart</title>');
    expect(rss).toContain('<guid>chart-2026-02-22-'); // Part of guid should match
    expect(rss).toContain('/api/telemetry/chart.svg?t=1771761600000');
  });

  it('should include spike items', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now });
    
    expect(rss).toContain('<title>Usage Spike: 75,000 tokens</title>');
    expect(rss).toContain('<description>Model: openai/gpt-4o | Channel: matrix/Gavin</description>');
    expect(rss).toContain('<pubDate>Sun, 22 Feb 2026 11:00:00 GMT</pubDate>');
    expect(rss).toContain('type="image/svg+xml"');
    expect(rss).toContain('/api/telemetry/chart.svg?t=1771761600000');
  });

  it('should respect custom chartUrlBase', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now }, { chartUrlBase: 'https://example.com/chart.svg' });
    
    expect(rss).toContain('https://example.com/chart.svg?t=1771761600000');
  });

  it('should handle empty spikes', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes: [], now });
    
    expect(rss).toContain('<title>Latest Telemetry Chart</title>');
    expect(rss).not.toContain('Usage Spike:');
  });
});
