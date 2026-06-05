import type { BrowserToolName, JsonObject, JsonValue, SessionState } from '../protocol/index.js';
import { evaluateBrowserToolPermission } from './permissions.js';

export interface BrowserToolTransport {
  requestBrowserTool(tool: BrowserToolName, params: JsonObject): Promise<JsonValue | undefined>;
}

export function createBrowserToolExecutor(transport: BrowserToolTransport, session: SessionState) {
  return {
    async execute(tool: BrowserToolName, params: JsonObject) {
      const decision = evaluateBrowserToolPermission(session, tool);
      if (!decision.allowed) throw new Error(decision.reason);
      return transport.requestBrowserTool(tool, params);
    },
  };
}
