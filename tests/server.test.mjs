import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

// Resolve absolute path for mocking
const telemetryPath = path.resolve(__dirname, '../src/telemetry.mjs');

vi.mock('../src/telemetry.mjs', () => ({
  runTelemetry: vi.fn()
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn()
  }
}));

import { handleTelemetryHttpRequest } from '../src/server.mjs';
import { runTelemetry } from '../src/telemetry.mjs';

describe('HTTP Server Handler', () => {
  let mockRes;
  let mockApi;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      writeHead: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis()
    };
    mockApi = {
      getPaths: () => ({ stateDir: '/tmp/openclaw' })
    };
  });

  it('should trigger runTelemetry when debug=true is present', async () => {
    const mockReq = { 
      url: '/api/telemetry/chart.png?debug=true',
      headers: { host: 'localhost' },
      method: 'GET'
    };
    runTelemetry.mockResolvedValue(Buffer.from('fresh-png-data'));

    await handleTelemetryHttpRequest(mockReq, mockRes, mockApi);

    expect(runTelemetry).toHaveBeenCalledWith(mockApi, expect.objectContaining({ debug: true, format: 'png' }));
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(mockRes.end).toHaveBeenCalledWith(Buffer.from('fresh-png-data'));
  });

  it('should trigger runTelemetry with format=rss for feed.xml debug requests', async () => {
    const mockReq = { 
      url: '/api/telemetry/feed.xml?debug=true',
      headers: { host: 'localhost' },
      method: 'GET'
    };
    runTelemetry.mockResolvedValue('<rss>fresh-rss</rss>');

    await handleTelemetryHttpRequest(mockReq, mockRes, mockApi);

    expect(runTelemetry).toHaveBeenCalledWith(mockApi, expect.objectContaining({ debug: true, format: 'rss' }));
    expect(mockRes.end).toHaveBeenCalledWith('<rss>fresh-rss</rss>');
  });

  it('should read from disk when debug is not present', async () => {
    const mockReq = { 
      url: '/api/telemetry/chart.png',
      headers: { host: 'localhost' },
      method: 'GET'
    };
    fs.readFile.mockResolvedValue(Buffer.from('cached-png-data'));

    await handleTelemetryHttpRequest(mockReq, mockRes, mockApi);

    expect(runTelemetry).not.toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalledWith(Buffer.from('cached-png-data'));
  });

  it('should return false for unknown routes', async () => {
    const mockReq = { 
      url: '/api/unknown',
      headers: { host: 'localhost' },
      method: 'GET'
    };
    const result = await handleTelemetryHttpRequest(mockReq, mockRes, mockApi);
    expect(result).toBe(false);
  });
});
