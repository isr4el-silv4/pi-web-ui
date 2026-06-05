import type { BrowserToolName, SessionState } from '../protocol/index.js';

export type ToolPermissionDecision = { allowed: true } | { allowed: false; reason: string; requiresConfirmation?: boolean };

const debugReadTools = new Set<string>([
  'tabs.list', 'tabs.getCurrent', 'tabs.select', 'page.getHtml', 'page.getText', 'page.getSelection', 'page.captureScreenshot',
  'console.getLogs', 'console.clearLogBuffer', 'network.startCapture', 'network.stopCapture', 'network.getRequests', 'network.getRequest',
  'network.getResponseBody', 'debugger.attach', 'debugger.detach',
]);

export function evaluateBrowserToolPermission(session: SessionState, tool: BrowserToolName): ToolPermissionDecision {
  if (tool.startsWith('cookies.') && !session.cookieAccessEnabled) return { allowed: false, reason: 'Cookie access is disabled' };
  if (tool.startsWith('storage.') && !session.storageAccessEnabled) return { allowed: false, reason: 'Storage access is disabled' };
  if (tool === 'debugger.evaluateScript') return { allowed: false, requiresConfirmation: true, reason: 'Script evaluation requires confirmation' };
  if (tool === 'debugger.sendCdpCommand') return { allowed: false, requiresConfirmation: true, reason: 'Raw CDP command requires confirmation' };
  if (session.permissionMode === 'observe' && !['tabs.list', 'tabs.getCurrent', 'page.getText', 'page.getSelection', 'page.captureScreenshot'].includes(tool)) {
    return { allowed: false, reason: `Tool ${tool} is not allowed in observe mode` };
  }
  if (debugReadTools.has(tool) || tool.startsWith('cookies.') || tool.startsWith('storage.')) return { allowed: true };
  return session.permissionMode === 'control' ? { allowed: true } : { allowed: false, reason: `Tool ${tool} is not allowed in ${session.permissionMode} mode` };
}
