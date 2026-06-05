import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIDGE_PORT,
  createBrowserToolRequest,
  createBrowserToolResponse,
  isBrowserToolRequest,
  isBrowserToolResponse,
  isClientCommand,
  isPermissionMode,
} from '../index.js';

describe('protocol messages', () => {
  it('defines the default local bridge port', () => {
    expect(DEFAULT_BRIDGE_PORT).toBe(43117);
  });

  it('creates and identifies browser tool requests', () => {
    const request = createBrowserToolRequest('req-1', 'console.getLogs', {
      tabId: 'active',
    });

    expect(request).toEqual({
      id: 'req-1',
      type: 'browser_tool_request',
      tool: 'console.getLogs',
      params: { tabId: 'active' },
    });
    expect(isBrowserToolRequest(request)).toBe(true);
    expect(isBrowserToolRequest({ ...request, tool: 7 })).toBe(false);
  });

  it('creates and identifies browser tool responses', () => {
    const response = createBrowserToolResponse('req-1', true, { logs: [] });

    expect(response).toEqual({
      id: 'req-1',
      type: 'browser_tool_response',
      success: true,
      data: { logs: [] },
    });
    expect(isBrowserToolResponse(response)).toBe(true);
    expect(isBrowserToolResponse({ ...response, success: 'yes' })).toBe(false);
  });

  it('recognizes supported permission modes', () => {
    expect(isPermissionMode('observe')).toBe(true);
    expect(isPermissionMode('debug')).toBe(true);
    expect(isPermissionMode('control')).toBe(true);
    expect(isPermissionMode('admin')).toBe(false);
  });

  it('identifies initial side panel client commands', () => {
    expect(isClientCommand({ type: 'prompt', message: 'Check console errors' })).toBe(true);
    expect(isClientCommand({ type: 'abort' })).toBe(true);
    expect(isClientCommand({ type: 'new_session', cwd: '/tmp/project' })).toBe(true);
    expect(isClientCommand({ type: 'resume_session', sessionPath: '/tmp/session.jsonl' })).toBe(true);
    expect(isClientCommand({ type: 'set_permission_mode', mode: 'debug' })).toBe(true);
    expect(isClientCommand({ type: 'set_cookie_access', enabled: false })).toBe(true);
    expect(isClientCommand({ type: 'set_cookie_access', enabled: 'false' })).toBe(false);
  });
});
