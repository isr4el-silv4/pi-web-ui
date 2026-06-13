import { DEFAULT_BRIDGE_PORT } from '../protocol/index.js';

export interface BridgeStartContext {
  cwd: string;
  sessionPath?: string;
  cookieAccessEnabled: boolean;
  storageAccessEnabled: boolean;
  port: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStartContext(serialized: string | undefined): BridgeStartContext {
  let parsed: unknown = {};
  if (serialized) {
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('Invalid PI_WEB_UI_START_CONTEXT JSON');
    }
  }

  if (!record(parsed) || typeof parsed.cwd !== 'string') {
    throw new Error('Bridge start context requires cwd');
  }

  return {
    cwd: parsed.cwd,
    ...(typeof parsed.sessionPath === 'string' ? { sessionPath: parsed.sessionPath } : {}),
    cookieAccessEnabled: typeof parsed.cookieAccessEnabled === 'boolean' ? parsed.cookieAccessEnabled : false,
    storageAccessEnabled: typeof parsed.storageAccessEnabled === 'boolean' ? parsed.storageAccessEnabled : false,
    port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_BRIDGE_PORT,
  };
}
