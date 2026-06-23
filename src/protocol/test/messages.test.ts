import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIDGE_PORT,
  createBrowserToolRequest,
  createBrowserToolResponse,
  isBrowserToolRequest,
  isBrowserToolResponse,
  isClientCommand,
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

  it('identifies initial side panel client commands', () => {
    expect(isClientCommand({ type: 'prompt', message: 'Check console errors' })).toBe(true);
    expect(isClientCommand({ type: 'abort' })).toBe(true);
    expect(isClientCommand({ type: 'new_session', cwd: '/tmp/project' })).toBe(true);
    expect(isClientCommand({ type: 'resume_session', sessionPath: '/tmp/session.jsonl' })).toBe(true);
    expect(isClientCommand({ type: 'set_cookie_access', enabled: false })).toBe(true);
    expect(isClientCommand({ type: 'extension_ui_response', id: 'ui-1', value: true })).toBe(true);
    expect(isClientCommand({ type: 'set_cookie_access', enabled: 'false' })).toBe(false);
  });

  it('identifies list_sessions command', () => {
    expect(isClientCommand({ type: 'list_sessions', cwd: '/project' })).toBe(true);
    expect(isClientCommand({ type: 'list_sessions' })).toBe(false); // missing cwd
    expect(isClientCommand({ type: 'list_sessions', cwd: 123 })).toBe(false); // cwd not string
  });

  it('identifies list_resources command', () => {
    expect(isClientCommand({ type: 'list_resources' })).toBe(true);
  });

  it('identifies get_completions command', () => {
    expect(isClientCommand({ type: 'get_completions', command: 'persona', args: '' })).toBe(true);
    expect(isClientCommand({ type: 'get_completions', command: 'persona', args: 'x' })).toBe(true);
    expect(isClientCommand({ type: 'get_completions', command: '', args: '' })).toBe(true); // empty is valid
    expect(isClientCommand({ type: 'get_completions', command: 'persona' })).toBe(false); // missing args
    expect(isClientCommand({ type: 'get_completions', args: '' })).toBe(false); // missing command
    expect(isClientCommand({ type: 'get_completions', command: 123, args: '' })).toBe(false); // command not string
  });
});
