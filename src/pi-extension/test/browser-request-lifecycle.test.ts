import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPiWebUiTools, setController } from '../../index.js';
import { createPiWebUiController } from '../launcher.js';
import { createBridgeProcessManager } from '../bridge-process.js';

afterEach(() => { setController(undefined); vi.unstubAllGlobals(); });

type Tool = { name: string; execute(id: string, params: Record<string, unknown>, signal: AbortSignal): Promise<{ isError?: boolean; content: Array<{ text: string }> }> };
function setup() {
  const manager = createBridgeProcessManager();
  setController(createPiWebUiController({ bridge: manager }));
  const tools: Tool[] = [];
  registerPiWebUiTools({ registerTool: (tool: Tool) => tools.push(tool) } as unknown as ExtensionAPI);
  return tools.find((tool) => tool.name === 'browser_send_cdp_command')!;
}

describe('terminal HTTP browser request lifecycle', () => {
  it('translates SDK names and carries cancellation all the way to fetch', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = setup();
    const controller = new AbortController();
    const result = tool.execute('synthetic', { method: 'Runtime.evaluate' }, controller.signal);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).tool).toBe('debugger.sendCdpCommand');
    controller.abort(new Error('Synthetic caller abort'));
    await expect(result).resolves.toMatchObject({ isError: true });
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
  });

  it('does not turn an HTTP failure into an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Action outcome is unknown; do not retry' }), { status: 504 })));
    const result = await setup().execute('synthetic', {}, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/outcome is unknown/);
  });

  it('does not dispatch an already canceled terminal request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    const result = await setup().execute('synthetic', {}, controller.signal);
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
