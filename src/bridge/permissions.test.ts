import { describe, expect, it } from 'vitest';
import { evaluateBrowserToolPermission } from './permissions.js';

const session = { id: 's1', cwd: '/', permissionMode: 'debug' as const, cookieAccessEnabled: false, storageAccessEnabled: false };

describe('browser tool permission policy', () => {
  it('blocks cookies and storage until toggled on', () => {
    expect(evaluateBrowserToolPermission(session, 'cookies.get')).toEqual({ allowed: false, reason: 'Cookie access is disabled' });
    expect(evaluateBrowserToolPermission(session, 'storage.getLocal')).toEqual({ allowed: false, reason: 'Storage access is disabled' });
  });

  it('allows debug read tools in debug mode', () => {
    expect(evaluateBrowserToolPermission(session, 'console.getLogs')).toEqual({ allowed: true });
    expect(evaluateBrowserToolPermission(session, 'network.getResponseBody')).toEqual({ allowed: true });
  });

  it('requires confirmation for risky debug tools', () => {
    expect(evaluateBrowserToolPermission(session, 'debugger.evaluateScript')).toEqual({ allowed: false, requiresConfirmation: true, reason: 'Script evaluation requires confirmation' });
    expect(evaluateBrowserToolPermission(session, 'debugger.sendCdpCommand')).toEqual({ allowed: false, requiresConfirmation: true, reason: 'Raw CDP command requires confirmation' });
  });
});
