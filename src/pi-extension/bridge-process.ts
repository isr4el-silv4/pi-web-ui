import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
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

export function defaultBridgeEntryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../bridge/server.js');
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

export function createBridgeProcessManager(deps: {
  spawn?: Spawn;
  statusProbe?: StatusProbe;
  bridgeEntryPath?: string;
} = {}): BridgeProcessManager {
  const spawn = deps.spawn ?? nodeSpawn;
  const statusProbe = deps.statusProbe ?? defaultStatusProbe;
  const bridgeEntryPath = deps.bridgeEntryPath ?? defaultBridgeEntryPath();

  return {
    async start(options) {
      const existing = await statusProbe(options.port);
      if (existing.running) {
        return { pid: existing.pid, port: existing.port ?? options.port, alreadyRunning: true };
      }

      const child = spawn(process.execPath, [bridgeEntryPath], {
        cwd: options.cwd,
        detached: true,
        env: { ...process.env, PI_WEB_UI_START_CONTEXT: JSON.stringify(options) },
        stdio: 'ignore',
      }) as ChildProcess;
      child.unref?.();
      return { pid: child.pid, port: options.port, alreadyRunning: false };
    },
    async stop() {
      // Implemented in bridge MVP when a shutdown endpoint exists.
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
