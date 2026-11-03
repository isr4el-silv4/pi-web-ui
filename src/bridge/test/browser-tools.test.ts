import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../../protocol/index.js';
import { createBrowserToolExecutor, parseAutoApproveEvaluateOrigins } from '../browser-tools.js';

const session = { id: 's1', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false };

describe('bridge browser tool executor', () => {
  it('forwards allowed tool calls to chrome extension clients', async () => {
    const requestBrowserTool = vi.fn(async () => ({ logs: [] }));
    const executor = createBrowserToolExecutor({ requestBrowserTool }, session);

    await expect(executor.execute('console.getLogs', { tabId: 'active' })).resolves.toEqual({ logs: [] });
    expect(requestBrowserTool).toHaveBeenCalledWith('console.getLogs', { tabId: 'active' });
  });

  it('blocks disallowed tools before forwarding', async () => {
    const requestBrowserTool = vi.fn();
    const executor = createBrowserToolExecutor({ requestBrowserTool }, session);

    await expect(executor.execute('cookies.get', {})).rejects.toThrow('Cookie access is disabled');
    expect(requestBrowserTool).not.toHaveBeenCalled();
  });
});

describe('auto-approved Runtime.evaluate on trusted origins', () => {
  const evaluate = { tabId: 7, method: 'Runtime.evaluate', params: { expression: '1 + 1' } };

  function setup(tabUrl: string, origins = 'https://app.example.test') {
    const requestBrowserTool = vi.fn(async (tool: string): Promise<JsonValue> =>
      tool === 'tabs.list' ? { tabs: [{ id: 7, url: tabUrl }, { id: 8, url: 'https://other.example.test/' }] } : { result: { value: 2 } });
    const confirm = vi.fn(async () => false);
    const record = vi.fn();
    const executor = createBrowserToolExecutor({ requestBrowserTool, confirm, audit: { record } }, session, {
      autoApproveEvaluateOrigins: parseAutoApproveEvaluateOrigins(origins),
    });
    return { executor, requestBrowserTool, confirm, record };
  }

  it('runs without a prompt when the target tab is on a trusted origin, and audits it', async () => {
    const { executor, requestBrowserTool, confirm, record } = setup('https://app.example.test/chat?x=1');

    await expect(executor.execute('debugger.sendCdpCommand', evaluate)).resolves.toEqual({ result: { value: 2 } });
    expect(confirm).not.toHaveBeenCalled();
    expect(requestBrowserTool).toHaveBeenLastCalledWith('debugger.sendCdpCommand', evaluate);
    expect(record).toHaveBeenCalledWith({ action: 'debugger.sendCdpCommand', params: { ...evaluate, autoApproved: true } });
  });

  it('still asks when the tab is on another origin', async () => {
    const { executor, requestBrowserTool, confirm } = setup('https://app.example.test.evil.test/');

    await expect(executor.execute('debugger.sendCdpCommand', evaluate)).rejects.toThrow('Raw CDP command requires confirmation');
    expect(confirm).toHaveBeenCalledOnce();
    expect(requestBrowserTool).not.toHaveBeenCalledWith('debugger.sendCdpCommand', evaluate);
  });

  it('still asks for other CDP methods on a trusted origin', async () => {
    const { executor, confirm } = setup('https://app.example.test/');

    await expect(executor.execute('debugger.sendCdpCommand', { tabId: 7, method: 'Page.navigate', params: { url: 'https://x.test' } }))
      .rejects.toThrow('Raw CDP command requires confirmation');
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('still asks when no origin is configured', async () => {
    const { executor, requestBrowserTool, confirm } = setup('https://app.example.test/', '');

    await expect(executor.execute('debugger.sendCdpCommand', evaluate)).rejects.toThrow('Raw CDP command requires confirmation');
    expect(confirm).toHaveBeenCalledOnce();
    expect(requestBrowserTool).not.toHaveBeenCalled();
  });

  it('accepts only exact http(s) origins', () => {
    expect([...parseAutoApproveEvaluateOrigins(' https://a.test , https://b.test:8443/ ,https://c.test/path,https://*.d.test,ftp://e.test,nonsense')])
      .toEqual(['https://a.test', 'https://b.test:8443']);
  });
});
