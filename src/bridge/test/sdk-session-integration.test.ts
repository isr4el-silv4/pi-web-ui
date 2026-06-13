import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createBridgeApp } from '../server.js';
import { attachWebSocketServer } from '../websocket-server.js';

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('bridge SDK session integration', () => {
  it('creates SDK session when sdkHost is provided', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockReturnValue(() => {}),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });

    // Wait for SDK session to be created
    await app.ready;

    const status = app.status();
    expect(status.sdkSession).toBeDefined();
    expect(sdkHost.create).toHaveBeenCalledWith({ cwd: '/project', sessionPath: undefined });
  });

  it('forwards prompt to SDK session when ready', async () => {
    const promptCalls: Array<{ text: string }> = [];
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: (text: string) => {
          promptCalls.push({ text });
          return Promise.resolve();
        },
        subscribe: vi.fn().mockReturnValue(() => {}),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });

    // Wait for SDK session to be ready
    await app.ready;

    // Send a prompt
    app.handleClientCommand({ type: 'prompt', message: 'Test prompt' });

    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(promptCalls).toEqual([{ text: 'Test prompt' }]);
  });

  it('handles WebSocket connection and prompt relay', async () => {
    const promptCalls: Array<{ text: string }> = [];
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: (text: string) => {
          promptCalls.push({ text });
          return Promise.resolve();
        },
        subscribe: vi.fn().mockReturnValue(() => {}),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });

    // Wait for SDK session to be ready
    await app.ready;

    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Verify browser client count increased
    expect(app.status().browserClients).toBe(1);

    // Collect messages
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.length >= 2) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });

    ws.send(JSON.stringify({ type: 'prompt', message: 'WebSocket test' }));
    const received = await messagePromise;

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ type: 'prompt_received', message: 'WebSocket test' });
    expect(received[1]).toMatchObject({ type: 'session_state' });
    expect(promptCalls).toEqual([{ text: 'WebSocket test' }]);
  });

  it('relays assistant messages from SDK to WebSocket client', async () => {
    let subscribeCallback: ((event: Record<string, unknown>) => void) | undefined;
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn((cb) => {
          subscribeCallback = cb;
          return () => {};
        }),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });

    await app.ready;

    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Send a prompt first to establish the connection
    const initialMessages: Record<string, unknown>[] = [];
    const initialPromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        initialMessages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (initialMessages.length >= 2) {
          ws.removeListener('message', handler);
          resolve(initialMessages);
        }
      };
      ws.on('message', handler);
    });
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hi' }));
    await initialPromise;

    // Now listen for assistant message relay
    const assistantMessage = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    });

    // Trigger a message_end event from the SDK session (assistant response)
    if (subscribeCallback) {
      subscribeCallback({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello from Pi!' }] } });
    }

    await expect(assistantMessage).resolves.toMatchObject({
      type: 'assistant_message',
      text: 'Hello from Pi!',
    });
  });
});
