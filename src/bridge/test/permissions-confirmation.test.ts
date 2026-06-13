import { describe, expect, it, vi } from 'vitest';
import { createBrowserToolExecutor } from '../browser-tools.js';

describe('browser tool confirmation enforcement', () => {
  it('asks for confirmation before executing risky tools and audits approval', async () => {
    const transport = { requestBrowserTool: vi.fn(async () => ({ result: 2 })) };
    const confirm = vi.fn(async () => true);
    const audit = { record: vi.fn() };
    const executor = createBrowserToolExecutor(
      { ...transport, confirm, audit },
      { id: 's1', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false },
    );

    await expect(executor.execute('debugger.evaluateScript', { expression: '1+1' })).resolves.toEqual({ result: 2 });
    expect(confirm).toHaveBeenCalledWith('Allow browser tool debugger.evaluateScript? Script evaluation requires confirmation');
    expect(audit.record).toHaveBeenCalledWith({ action: 'debugger.evaluateScript', params: { expression: '1+1' } });
  });

  it('blocks risky tools when confirmation is denied', async () => {
    const executor = createBrowserToolExecutor(
      { requestBrowserTool: vi.fn(), confirm: vi.fn(async () => false) },
      { id: 's1', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false },
    );

    await expect(executor.execute('debugger.sendCdpCommand', { method: 'Page.navigate' })).rejects.toThrow('Raw CDP command requires confirmation');
  });
});
