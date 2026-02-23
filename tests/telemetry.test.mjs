import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { runTelemetry } from '../src/telemetry.mjs';

// Mock spawn
vi.mock('node:child_process', () => {
  const spawn = vi.fn(() => {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    setImmediate(() => proc.emit('close', 0));
    return proc;
  });
  return { spawn };
});

describe('telemetry-wallpaper core logic', () => {
  let tmpDir;
  let mockApi;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-test-'));
    const sessionsDir = path.join(tmpDir, 'agents/main/sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    mockApi = {
      getPaths: () => ({ stateDir: tmpDir }),
      pluginConfig: {
        spikeThreshold: 1000, 
        resolution: '1920x1080',
        theme: 'gruvbox-dark'
      }
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse session logs and generate SVG', async () => {
    const sessionsDir = path.join(tmpDir, 'agents/main/sessions');
    const logPath = path.join(sessionsDir, 'test-session.jsonl');
    
    const entry = {
      type: 'message',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant', provider: 'anthropic', model: 'claude',
        usage: { input: 500, output: 200 }
      }
    };

    await fs.writeFile(logPath, JSON.stringify(entry) + '\n');
    await runTelemetry(mockApi);

    const svgPath = path.join(tmpDir, 'usage_telemetry.svg');
    expect(await fs.access(svgPath).then(() => true)).toBe(true);
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
        role: 'assistant', provider: 'anthropic', model: 'claude',
        usage: { input: 10000, output: 5000, cacheRead: 50000 }
      }
    };

    await fs.writeFile(logPath, JSON.stringify({type: 'session', id: 'spike-id', timestamp: now.toISOString()}) + '\n');
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n');

    await runTelemetry(mockApi);

    const pad = (n) => String(n).padStart(2, '0');
    const localDay = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    
    const historyPath = path.join(tmpDir, 'storage/plugins/telemetry-collector', `usage_${localDay}.json`);
    const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    
    expect(history.spikes.length).toBe(1);
    expect(history.spikes[0].channel).toBe('matrix/Gavin');
  });
});
