import { describe, expect, it, vi } from 'vitest';
import { createBrowserToolExecutor } from '../browser-tools.js';

describe('bridge browser tool executor', () => {
  it('forwards allowed tool calls to chrome extension clients', async () => {
    const requestBrowserTool = vi.fn(async () => ({ logs: [] }));
    const executor = createBrowserToolExecutor({ requestBrowserTool }, { id: 's1', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false });

    await expect(executor.execute('console.getLogs', { tabId: 'active' })).resolves.toEqual({ logs: [] });
    expect(requestBrowserTool).toHaveBeenCalledWith('console.getLogs', { tabId: 'active' });
  });

  it('blocks disallowed tools before forwarding', async () => {
    const requestBrowserTool = vi.fn();
    const executor = createBrowserToolExecutor({ requestBrowserTool }, { id: 's1', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false });

    await expect(executor.execute('cookies.get', {})).rejects.toThrow('Cookie access is disabled');
    expect(requestBrowserTool).not.toHaveBeenCalled();
  });
});
