import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runTelemetry } from '../src/telemetry.mjs';

// Mock exec to prevent actual gsettings/sh calls
vi.mock('node:child_process', () => ({
  exec: (cmd, opts, cb) => {
    if (typeof cb === 'function') cb(null, { stdout: 'mocked', stderr: '' });
    else if (typeof opts === 'function') opts(null, { stdout: 'mocked', stderr: '' });
  },
  promisify: (fn) => (arg, opts) => Promise.resolve({ stdout: 'mocked', stderr: '' })
}));

describe('telemetry-wallpaper core logic', () => {
  let tmpDir;
  let mockApi;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-test-'));
    
    const sessionsDir = path.join(tmpDir, 'agents/main/sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    mockApi = {
      getPaths: () => ({
        stateDir: tmpDir
      }),
      pluginConfig: {
        spikeThreshold: 1000, 
        resolution: '1920x1080',
        theme: 'gruvbox-dark'
      },
      runtime: {
        state: {
          resolveStateDir: () => tmpDir
        }
      }
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse session logs and generate SVG', async () => {
    const sessionsDir = path.join(tmpDir, 'agents/main/sessions');
    const logPath = path.join(sessionsDir, 'test-session.jsonl');
    
    const now = new Date();
    const entry = {
      type: 'message',
      timestamp: now.toISOString(),
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        usage: {
          input: 500,
          output: 200,
          cacheRead: 1000,
          cacheWrite: 500
        }
      }
    };

    await fs.writeFile(logPath, JSON.stringify(entry) + '\n');

    await runTelemetry(mockApi);

    const svgPath = path.join(tmpDir, 'hourly_model_usage.svg');
    const svgExists = await fs.access(svgPath).then(() => true).catch(() => false);
    expect(svgExists).toBe(true);

    const svgContent = await fs.readFile(svgPath, 'utf8');
    expect(svgContent).toContain('Token Usage');
    expect(svgContent).toContain('anthropic/claude-sonnet-4-5-20250929 (Active)');
  });

  it('should detect spikes and attribute them correctly', async () => {
    const sessionsDir = path.join(tmpDir, 'agents/main/sessions');
    const logPath = path.join(sessionsDir, 'test-spike.jsonl');
    
    const sessionsJson = path.join(sessionsDir, 'sessions.json');
    await fs.writeFile(sessionsJson, JSON.stringify({
      "agent:main:main": {
        sessionId: "spike-id",
        origin: { label: "Gavin", provider: "matrix" }
      }
    }));

    const now = new Date();
    const entry = {
      type: 'message',
      timestamp: now.toISOString(),
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'claude-opus',
        usage: {
          input: 10000,
          output: 5000,
          cacheRead: 50000, 
          cacheWrite: 0
        }
      }
    };

    await fs.writeFile(logPath, JSON.stringify({type: 'session', id: 'spike-id', timestamp: now.toISOString()}) + '\n');
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n');

    await runTelemetry(mockApi);

    const pad = (n) => String(n).padStart(2, '0');
    const localDay = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    
    const historyPath = path.join(tmpDir, 'storage/plugins/telemetry-wallpaper', `usage_${localDay}.json`);
    const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    
    expect(history.spikes.length).toBe(1);
    expect(history.spikes[0].channel).toBe('matrix/Gavin');
    expect(history.spikes[0].tokens).toBe(65000);
  });
});
