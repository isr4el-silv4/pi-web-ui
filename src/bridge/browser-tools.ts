import type { BrowserToolName, JsonObject, JsonValue, SessionState } from '../protocol/index.js';
import { evaluateBrowserToolPermission } from './permissions.js';

export interface BrowserToolTransport {
  requestBrowserTool(tool: BrowserToolName, params: JsonObject): Promise<JsonValue | undefined>;
  confirm?(message: string): Promise<boolean>;
  input?(message: string): Promise<string>;
  notify?(message: string): void;
  audit?: { record(entry: { action: string; params?: unknown }): void };
}

export function createBrowserToolExecutor(transport: BrowserToolTransport, session: SessionState) {
  return {
    async execute(tool: BrowserToolName, params: JsonObject) {
      const decision = evaluateBrowserToolPermission(session, tool);
      if (!decision.allowed) {
        if (!decision.requiresConfirmation) throw new Error(decision.reason);
        const confirmed = await transport.confirm?.(`Allow browser tool ${tool}? ${decision.reason}`);
        if (!confirmed) throw new Error(decision.reason);
        transport.audit?.record({ action: tool, params });
      }
      return transport.requestBrowserTool(tool, params);
    },
  };
}
