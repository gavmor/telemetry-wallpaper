import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { runTelemetry } from '../src/telemetry.mjs';
import register from '../index.mjs';

// Mock spawn for core tests
vi.mock('node:child_process', () => {
  const spawn = vi.fn(() => {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    setImmediate(() => proc.emit('close', 0));
    return proc;
  });
  return { spawn };
});

describe('extension registration health check', () => {
  it('should register exactly the expected hooks and HTTP handlers', () => {
    const registeredHooks = [];
    let registeredHttpHandler = null;

    const mockApi = {
      on: (event, handler) => {
        registeredHooks.push(event);
      },
      registerHttpHandler: (handler) => {
        registeredHttpHandler = handler;
      },
      pluginConfig: {},
      runtime: { state: { resolveStateDir: () => '/tmp' } }
    };

    register(mockApi);

    // Verify hooks
    expect(registeredHooks).toContain('gateway:startup');
    expect(registeredHooks).toContain('message_sent');
    expect(registeredHooks).toContain('message_received');
    
    // Verify HTTP handler
    expect(registeredHttpHandler).toBeTypeOf('function');
    expect(registeredHttpHandler.name).toBe('handleTelemetryHttpRequest');
  });
});

describe('telemetry-collector core logic', () => {
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
      },
      emit: vi.fn(),
      on: vi.fn()
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse session logs and generate SVG and RSS', async () => {
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
    const rssPath = path.join(tmpDir, 'telemetry_feed.xml');
    expect(await fs.access(svgPath).then(() => true)).toBe(true);
    expect(await fs.access(rssPath).then(() => true)).toBe(true);
    
    const rssContent = await fs.readFile(rssPath, 'utf8');
    expect(rssContent).toContain('<media:content');
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
