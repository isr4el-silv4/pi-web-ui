import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createBridgeApp, createHttpServer } from '../server.js';
import { createBrowserToolDefinitions } from '../sdk-session.js';

const context = { cwd: process.cwd(), port: 0, cookieAccessEnabled: false, storageAccessEnabled: false };
const sdkHost = { create: vi.fn(async () => ({ subscribe: () => () => {}, abort: async () => {} })) };
const fixtures: Array<ReturnType<typeof createHttpServer>> = [];

afterEach(async () => {
  for (const server of fixtures.splice(0)) {
    const app = (server as typeof server & { _app: ReturnType<typeof createBridgeApp> })._app;
    await app.handleClientCommand({ type: 'abort' });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function fixture() {
  const server = createHttpServer(context, sdkHost);
  fixtures.push(server);
  const app = (server as typeof server & { _app: ReturnType<typeof createBridgeApp> })._app;
  await app.ready;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, app, port: (server.address() as AddressInfo).port };
}

describe('HTTP permission cancellation', () => {
  it('withdraws approval when its HTTP client disconnects and ignores a late OK', async () => {
    const { app, port } = await fixture();
    let ask!: (id: string) => void;
    let expire!: (id: string) => void;
    const asked = new Promise<string>((resolve) => { ask = resolve; });
    const expired = new Promise<string>((resolve) => { expire = resolve; });
    const actions: unknown[] = [];
    app.browserClients.addClient({ send(raw) {
      const packet = JSON.parse(raw);
      if (packet.type === 'extension_ui_request') ask(packet.id);
      if (packet.type === 'extension_ui_request_timeout') expire(packet.id);
      if (packet.type === 'browser_tool_request') actions.push(packet);
    } });
    const client = request({ hostname: '127.0.0.1', port, path: '/browser-tool', method: 'POST', headers: { 'Content-Type': 'application/json' } });
    client.on('error', () => {});
    client.end(JSON.stringify({ tool: 'debugger.sendCdpCommand', params: { method: 'Runtime.evaluate' } }));
    const id = await asked;
    client.destroy();
    expect(await expired).toBe(id);
    await expect(app.handleClientCommand({ type: 'extension_ui_response', id, value: true })).resolves.toEqual({ handled: false });
    expect(actions).toHaveLength(0);
  });

  it('returns DOM reads without prompting and settles a synchronous fake-browser reply', async () => {
    const { app, port } = await fixture();
    const prompts: unknown[] = [];
    const browser = app.browserClients.addClient({ send(raw) {
      const packet = JSON.parse(raw);
      if (packet.type === 'extension_ui_request') prompts.push(packet);
      if (packet.type === 'browser_tool_request') browser.receive(JSON.stringify({ type: 'browser_tool_response', id: packet.id, success: true, data: { attributes: [] } }));
    } });
    const response = await fetch(`http://127.0.0.1:${port}/browser-tool`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'debugger.sendCdpCommand', params: { method: 'DOM.getAttributes' } }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ attributes: [] });
    expect(prompts).toHaveLength(0);
  });
});

describe('agent and session cancellation', () => {
  it.each(['abort', 'new_session'] as const)('invalidates permission requests on %s', async (type) => {
    const app = createBridgeApp({ context, sdkHost });
    await app.ready;
    const packets: Array<{ type: string; id?: string }> = [];
    app.browserClients.addClient({ send(raw) { packets.push(JSON.parse(raw)); } });
    const pending = app.executeBrowserTool('debugger.sendCdpCommand', { method: 'Runtime.evaluate' });
    const rejection = expect(pending).rejects.toThrow(/canceled/i);
    const id = packets.find((packet) => packet.type === 'extension_ui_request')!.id!;
    await app.handleClientCommand(type === 'abort' ? { type } : { type, cwd: process.cwd() });
    await rejection;
    await expect(app.handleClientCommand({ type: 'extension_ui_response', id, value: true })).resolves.toEqual({ handled: false });
    expect(packets.some((packet) => packet.type === 'browser_tool_request')).toBe(false);
    await app.ready;
  });

  it('passes the SDK AbortSignal to the executor', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const definitions = createBrowserToolDefinitions({ defineTool: (definition) => definition }, { execute }) as Array<{ name: string; execute(id: string, params: Record<string, never>, signal?: AbortSignal): Promise<unknown> }>;
    const tool = definitions.find((definition) => definition.name === 'browser_get_page_text')!;
    const controller = new AbortController();
    await tool.execute('synthetic', {}, controller.signal);
    expect(execute).toHaveBeenCalledWith('page.getText', {}, { signal: controller.signal });
  });
});
