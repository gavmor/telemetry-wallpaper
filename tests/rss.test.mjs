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
    
    expect(rss).toContain('OpenClaw Telemetry');
    expect(rss).toContain('Real-time token usage');
  });

  it('should include the latest telemetry chart item', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes, now });
    
    expect(rss).toContain('Latest Telemetry Chart');
    expect(rss).toContain('chart-2026-02-22-');
  });

  it('should handle empty spikes', () => {
    const rss = renderTelemetryRSS({ todayStr, spikes: [], now });
    expect(rss).toContain('Latest Telemetry Chart');
  });
});
