import { describe, it, expect } from 'vitest';
import { renderUsageSVG } from '../src/renderer.mjs';

describe('telemetry-wallpaper renderer', () => {
  it('should generate a valid SVG string from telemetry data', () => {
    const mockData = {
      date: '2026-02-22',
      stats: {
        '2026-02-22 12:00': {
          'anthropic/claude': { active: 1000, cache: 5000 }
        }
      },
      spikes: [
        { interval: '2026-02-22 12:00', channel: 'matrix/test-user' }
      ]
    };

    const svg = renderUsageSVG(mockData, { resolution: '1920x1080' });
    
    expect(svg).toContain('<svg width="1920" height="1080"');
    expect(svg).toContain('Token Usage');
    expect(svg).toContain('anthropic/claude (Active)');
    expect(svg).toContain('anthropic/claude (Cache)');
    expect(svg).toContain('matrix/test-user');
  });

  it('should handle empty data gracefully', () => {
    const svg = renderUsageSVG({}, { resolution: '800x600' });
    expect(svg).toContain('<svg width="800" height="600"');
    expect(svg).toContain('no-data');
  });
});
