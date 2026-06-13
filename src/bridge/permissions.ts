import type { BrowserToolName, SessionState } from '../protocol/index.js';

export type ToolPermissionDecision = { allowed: true } | { allowed: false; reason: string; requiresConfirmation?: boolean };

export function evaluateBrowserToolPermission(session: SessionState, tool: BrowserToolName): ToolPermissionDecision {
  if (tool.startsWith('cookies.') && !session.cookieAccessEnabled) return { allowed: false, reason: 'Cookie access is disabled' };
  if (tool.startsWith('storage.') && !session.storageAccessEnabled) return { allowed: false, reason: 'Storage access is disabled' };
  if (tool === 'debugger.evaluateScript') return { allowed: false, requiresConfirmation: true, reason: 'Script evaluation requires confirmation' };
  if (tool === 'debugger.sendCdpCommand') return { allowed: false, requiresConfirmation: true, reason: 'Raw CDP command requires confirmation' };
  return { allowed: true };
}
