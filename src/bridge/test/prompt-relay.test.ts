import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { createBridgeApp } from '../server.js';
import { attachWebSocketServer } from '../websocket-server.js';

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

function collectMessages(ws: WebSocket, count: number): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const messages: Record<string, unknown>[] = [];
    const handler = (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
      if (messages.length >= count) {
        ws.removeListener('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

describe('bridge prompt relay', () => {
  it('forwards prompt to SDK session and returns session state', async () => {
    const promptCalls: Array<{ text: string }> = [];
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: (text: string) => {
          promptCalls.push({ text });
          return Promise.resolve();
        },
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Expect 2 messages: prompt_received broadcast + session_state response
    const messagesPromise = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hello Pi' }));

    const messages = await messagesPromise;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: 'prompt_received', message: 'Hello Pi' });
    expect(messages[1]).toMatchObject({ type: 'session_state' });
    expect(promptCalls).toEqual([{ text: 'Hello Pi' }]);
  });

  it('relays assistant messages from SDK session to websocket client', async () => {
    let subscribeCallback: ((event: { type: string; text?: string }) => void) | undefined;
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
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Send a prompt to establish connection and consume initial messages
    const initialMessages = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hi' }));
    await initialMessages;

    // Now listen for assistant message relay
    const assistantMessage = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    });

    // Trigger an assistant_message event from the SDK session
    if (subscribeCallback) {
      subscribeCallback({ type: 'assistant_message', text: 'Hello from Pi!' });
    }

    await expect(assistantMessage).resolves.toMatchObject({
      type: 'assistant_message',
      text: 'Hello from Pi!',
    });
  });

  it('handles prompt when SDK session is not yet ready', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Send prompt before SDK is ready - should still get prompt_received + session_state
    const messagesPromise = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Early prompt' }));

    const messages = await messagesPromise;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: 'prompt_received', message: 'Early prompt' });
    expect(messages[1]).toMatchObject({ type: 'session_state' });
  });
});
