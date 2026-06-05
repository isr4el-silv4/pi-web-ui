import { DEFAULT_BRIDGE_PORT, type PermissionMode } from '../protocol/index.js';
import { createBridgeProcessManager, type BridgeProcessManager } from './bridge-process.js';
import { createChromeOpener, type ChromeOpener } from './chrome.js';

export type PiWebUiCommand = 'start' | 'stop' | 'status' | 'open';

export interface TerminalContext {
  cwd: string;
  sessionPath?: string;
}

export interface PiWebUiController {
  start(context: TerminalContext): Promise<string>;
  stop(): Promise<string>;
  status(): Promise<string>;
  open(): Promise<string>;
}

export function parsePiWebUiCommand(args: string[]): { command: PiWebUiCommand } {
  const command = args[0] ?? 'status';
  if (command === 'start' || command === 'stop' || command === 'status' || command === 'open') {
    return { command };
  }
  throw new Error(`Unsupported /pi-web-ui command: ${command}`);
}

export function createPiWebUiController(deps: {
  bridge?: BridgeProcessManager;
  chrome?: ChromeOpener;
  defaultPermissionMode?: PermissionMode;
} = {}): PiWebUiController {
  const bridge = deps.bridge ?? createBridgeProcessManager();
  const chrome = deps.chrome ?? createChromeOpener();
  const defaultPermissionMode = deps.defaultPermissionMode ?? 'debug';

  return {
    async start(context) {
      const result = await bridge.start({
        cwd: context.cwd,
        sessionPath: context.sessionPath,
        permissionMode: defaultPermissionMode,
        cookieAccessEnabled: false,
        storageAccessEnabled: false,
        port: DEFAULT_BRIDGE_PORT,
      });
      await chrome.open({ port: result.port });
      return result.alreadyRunning
        ? `Pi Web UI bridge already running on port ${result.port}.`
        : `Pi Web UI bridge started on port ${result.port}.`;
    },
    async stop() {
      await bridge.stop();
      return 'Pi Web UI bridge stop requested.';
    },
    async status() {
      const status = await bridge.status();
      if (!status.running) return 'Pi Web UI bridge is not running.';
      return `Pi Web UI bridge is running on port ${status.port ?? DEFAULT_BRIDGE_PORT}${status.pid ? ` (pid ${status.pid})` : ''}.`;
    },
    async open() {
      await chrome.open({ port: DEFAULT_BRIDGE_PORT });
      return 'Pi Web UI opened in Chrome.';
    },
  };
}
