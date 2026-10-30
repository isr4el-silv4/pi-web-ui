import type { BrowserToolName, JsonObject, JsonValue, SessionState } from '../protocol/index.js';
import type { BrowserToolRequestOptions } from './browser-client.js';
import { evaluateBrowserToolPermission } from './permissions.js';

export interface BrowserToolTransport {
  requestBrowserTool(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
  confirm?(message: string, options?: BrowserToolRequestOptions): Promise<boolean>;
  input?(message: string): Promise<string>;
  notify?(message: string): void;
  audit?: { record(entry: { action: string; params?: unknown }): void };
}

export function createBrowserToolExecutor(transport: BrowserToolTransport, session: SessionState) {
  return {
    async execute(tool: BrowserToolName, params: JsonObject, options: BrowserToolRequestOptions = {}) {
      options.signal?.throwIfAborted();
      const decision = evaluateBrowserToolPermission(session, tool, params);
      if (!decision.allowed) {
        if (!decision.requiresConfirmation) throw new Error(decision.reason);
        const message = `Allow browser tool ${tool}? ${decision.reason}`;
        const confirmed = options.signal
          ? await transport.confirm?.(message, options)
          : await transport.confirm?.(message);
        options.signal?.throwIfAborted();
        if (confirmed !== true) throw new Error(decision.reason);
        transport.audit?.record({ action: tool, params });
      }
      options.signal?.throwIfAborted();
      return options.signal
        ? transport.requestBrowserTool(tool, params, options)
        : transport.requestBrowserTool(tool, params);
    },
  };
}
