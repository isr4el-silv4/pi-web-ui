import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { JsonObject, JsonValue, SessionStartOptions } from '../protocol/index.js';

export interface BridgeStartOptions extends SessionStartOptions {
  port: number;
}

export interface BridgeStatus {
  running: boolean;
  pid?: number;
  port?: number;
}

export interface BridgeStartResult {
  pid?: number;
  port: number;
  alreadyRunning: boolean;
}

export interface BridgeProcessManager {
  start(options: BridgeStartOptions): Promise<BridgeStartResult>;
  stop(): Promise<void>;
  status(): Promise<BridgeStatus>;
  requestBrowserTool(tool: string, params: JsonObject): Promise<JsonValue | undefined>;
}

type Spawn = (command: string, args: string[], options: Parameters<typeof nodeSpawn>[2]) => Partial<ChildProcess>;

type StatusProbe = (port: number) => Promise<BridgeStatus>;

const READY_POLL_INTERVAL_MS = 200;
const READY_TIMEOUT_MS = 10000;

export function defaultBridgeEntryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // When loaded from dist/ (npm install): ../bridge/server.js → dist/bridge/server.js
  const distPath = resolve(here, '../bridge/server.js');
  if (existsSync(distPath)) return distPath;
  // When loaded from src/ (Pi dev): ../../dist/bridge/server.js → <project-root>/dist/bridge/server.js
  const srcFallback = resolve(here, '../../dist/bridge/server.js');
  if (existsSync(srcFallback)) return srcFallback;
  return distPath;
}

async function defaultStatusProbe(port: number): Promise<BridgeStatus> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    if (!response.ok) return { running: false };
    const json = (await response.json()) as { pid?: number; port?: number };
    return { running: true, pid: json.pid, port: json.port ?? port };
  } catch {
    return { running: false };
  }
}

async function waitForBridgeReady(statusProbe: StatusProbe, port: number, timeoutMs: number, intervalMs: number, stderr: string[]): Promise<BridgeStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await statusProbe(port);
    if (status.running) return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const errorDetail = stderr.length > 0 ? `\nBridge stderr: ${stderr.join('\n').trim()}` : '';
  throw new Error(`Bridge did not become ready on port ${port} within ${timeoutMs}ms.${errorDetail}`);
}

export function createBridgeProcessManager(deps: {
  spawn?: Spawn;
  statusProbe?: StatusProbe;
  bridgeEntryPath?: string;
  readyTimeoutMs?: number;
  readyPollIntervalMs?: number;
  stopFn?: () => Promise<void>;
} = {}): BridgeProcessManager {
  const spawn = deps.spawn ?? nodeSpawn;
  const statusProbe = deps.statusProbe ?? defaultStatusProbe;
  const bridgeEntryPath = deps.bridgeEntryPath ?? defaultBridgeEntryPath();
  const readyTimeoutMs = deps.readyTimeoutMs ?? READY_TIMEOUT_MS;
  const readyPollIntervalMs = deps.readyPollIntervalMs ?? READY_POLL_INTERVAL_MS;
  const stopFn = deps.stopFn ?? defaultStopFn;

  return {
    async start(options) {
      const existing = await statusProbe(options.port);
      if (existing.running) {
        return { pid: existing.pid, port: existing.port ?? options.port, alreadyRunning: true };
      }

      const stderr: string[] = [];
      const child = spawn(process.execPath, [bridgeEntryPath], {
        cwd: options.cwd,
        detached: true,
        env: { ...process.env, PI_WEB_UI_START_CONTEXT: JSON.stringify(options) },
        stdio: ['ignore', 'ignore', 'pipe'],
      }) as ChildProcess;
      child.unref?.();

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr.push(data.toString());
        });
      }

      child.on('error', (error) => {
        stderr.push(String(error));
      });

      const ready = await waitForBridgeReady(statusProbe, options.port, readyTimeoutMs, readyPollIntervalMs, stderr);
      // Unref stderr so it doesn't keep the CLI process alive after bridge is ready
      (child.stderr as any)?.unref?.();
      return { pid: ready.pid ?? child.pid, port: ready.port ?? options.port, alreadyRunning: false };
    },
    async stop() {
      const status = await statusProbe(43117);
      if (!status.running) return;
      await stopFn();
    },
    async status() {
      return statusProbe(43117);
    },
    async requestBrowserTool(tool, params) {
      try {
        const response = await fetch(`http://127.0.0.1:${43117}/browser-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, params }),
        });
        if (!response.ok) {
          throw new Error(`Bridge request failed: ${response.status}`);
        }
        return (await response.json()) as JsonValue;
      } catch {
        return undefined;
      }
    },
  };
}

async function defaultStopFn(): Promise<void> {
  try {
    await fetch('http://127.0.0.1:43117/stop', { method: 'POST' });
  } catch {
    // Bridge may already be down
  }
}
