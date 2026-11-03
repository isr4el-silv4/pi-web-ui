import type { BrowserToolName, JsonObject, SessionState } from '../protocol/index.js';

export type ToolPermissionDecision = { allowed: true } | { allowed: false; reason: string; requiresConfirmation?: boolean };

// These inspect the page, like page.getHtml; never exempt a CDP domain or JavaScript.
const readOnlyDomMethods = new Set([
  'DOM.getDocument', 'DOM.describeNode', 'DOM.getAttributes',
  'DOM.getOuterHTML', 'DOM.querySelector', 'DOM.querySelectorAll',
]);

export function evaluateBrowserToolPermission(session: SessionState, tool: BrowserToolName, params: JsonObject = {}): ToolPermissionDecision {
  if (tool.startsWith('cookies.') && !session.cookieAccessEnabled) return { allowed: false, reason: 'Cookie access is disabled' };
  if (tool.startsWith('storage.') && !session.storageAccessEnabled) return { allowed: false, reason: 'Storage access is disabled' };
  if (tool === 'debugger.evaluateScript') return { allowed: false, requiresConfirmation: true, reason: 'Script evaluation requires confirmation' };
  if (tool === 'debugger.sendCdpCommand') {
    if (typeof params.method === 'string' && readOnlyDomMethods.has(params.method)) return { allowed: true };
    return { allowed: false, requiresConfirmation: true, reason: 'Raw CDP command requires confirmation' };
  }
  return { allowed: true };
}
