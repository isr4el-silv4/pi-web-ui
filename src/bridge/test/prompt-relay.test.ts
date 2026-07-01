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

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
  });
}

describe('bridge prompt relay', () => {
  it('forwards prompt to SDK session, sends prompt_sent on success', async () => {
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
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
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

    // Wait for SDK to be ready
    await app.ready;

    // Collect all 3 messages: prompt_received + prompt_sent (async) + session_state (sync)
    const allMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hello Pi' }));

    const messages = await allMessages;
    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.type === 'prompt_received' && m.message === 'Hello Pi')).toBe(true);
    expect(messages.some((m) => m.type === 'session_state')).toBe(true);
    expect(messages.some((m) => m.type === 'prompt_sent' && m.message === 'Hello Pi')).toBe(true);
    expect(promptCalls).toEqual([{ text: 'Hello Pi' }]);
  });

  it('relays assistant messages from SDK session to websocket client', async () => {
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
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Wait for SDK to be ready
    await app.ready;

    // Collect all messages from prompt
    const promptMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hi' }));
    await promptMessages;

    // Now listen for assistant message relay
    const assistantMessage = waitForMessage(ws);

    // Trigger a message_end event from the SDK session (assistant response)
    if (subscribeCallback) {
      subscribeCallback({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello from Pi!' }] } });
    }

    await expect(assistantMessage).resolves.toMatchObject({
      type: 'assistant_message',
      text: 'Hello from Pi!',
    });
  });

  it('relays assistant messages with thinking block from SDK session', async () => {
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
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Wait for SDK to be ready
    await app.ready;

    // Collect all messages from prompt
    const promptMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Hi' }));
    await promptMessages;

    // Now listen for assistant message relay
    const assistantMessage = waitForMessage(ws);

    // Trigger a message_end event with thinking block
    if (subscribeCallback) {
      subscribeCallback({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think about this carefully...' },
            { type: 'text', text: 'Here is my answer.' },
          ],
        },
      });
    }

    await expect(assistantMessage).resolves.toMatchObject({
      type: 'assistant_message',
      text: 'Here is my answer.',
      thinking: 'Let me think about this carefully...',
    });
  });

  it('queues prompt when SDK is not yet ready, forwards it once ready', async () => {
    let promptCalls: Array<{ text: string }> = [];
    let resolveSdk: () => void;
    const sdkReady = new Promise<void>((resolve) => { resolveSdk = resolve; });

    const sdkHost = {
      create: vi.fn().mockImplementation(() =>
        sdkReady.then(() => ({
          prompt: (text: string) => {
            promptCalls.push({ text });
            return Promise.resolve();
          },
        }))
      ),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
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

    // SDK is NOT ready yet - send prompt (should be queued)
    // prompt_received + session_state arrive immediately
    const syncMessages = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Early prompt' }));

    const messages = await syncMessages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: 'prompt_received', message: 'Early prompt' });
    expect(messages[1]).toMatchObject({ type: 'session_state' });
    // Prompt has NOT been forwarded yet
    expect(promptCalls).toEqual([]);

    // Now resolve the SDK - the queued prompt should be forwarded
    const promptSent = waitForMessage(ws);
    resolveSdk!();
    await app.ready;

    await expect(promptSent).resolves.toMatchObject({ type: 'prompt_sent', message: 'Early prompt' });
    expect(promptCalls).toEqual([{ text: 'Early prompt' }]);
  });

  it('survives SDK subscription callback throwing and still sends prompt_sent', async () => {
    let subscribeCallback: ((event: Record<string, unknown>) => void) | undefined;
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockImplementation((text: string) => {
          // Simulate SDK emitting events synchronously during prompt
          if (subscribeCallback) {
            subscribeCallback({ type: 'message_end', message: { role: 'assistant', content: undefined } });
          }
          return Promise.resolve();
        }),
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
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Wait for SDK to be ready
    await app.ready;

    // Collect messages: prompt_received + session_state + prompt_sent
    const allMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Test' }));

    const messages = await allMessages;
    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.type === 'prompt_received' && m.message === 'Test')).toBe(true);
    expect(messages.some((m) => m.type === 'session_state')).toBe(true);
    // prompt_sent should arrive even if subscription callback threw
    expect(messages.some((m) => m.type === 'prompt_sent' && m.message === 'Test')).toBe(true);
  });

  it('survives broadcast throwing inside subscription callback and still sends prompt_sent', async () => {
    let subscribeCallback: ((event: Record<string, unknown>) => void) | undefined;
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockImplementation((text: string) => {
          if (subscribeCallback) {
            subscribeCallback({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } });
          }
          return Promise.resolve();
        }),
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

    // Intercept broadcast to simulate a throw during message_end processing
    const originalBroadcast = app.browserClients.broadcast.bind(app.browserClients);
    let broadcastCount = 0;
    app.browserClients.broadcast = (msg: unknown) => {
      broadcastCount++;
      const msgType = (msg as Record<string, unknown>)?.type;
      if (msgType === 'assistant_message') {
        // Simulate broadcast throwing during the subscription callback
        throw new Error('content is not iterable');
      }
      return originalBroadcast(msg as Parameters<typeof originalBroadcast>[0]);
    };

    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    await app.ready;

    // Collect messages: prompt_received + session_state + prompt_sent
    // (assistant_message broadcast throws and is caught, so it never reaches WebSocket)
    const allMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Test' }));

    const messages = await allMessages;
    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.type === 'prompt_received' && m.message === 'Test')).toBe(true);
    expect(messages.some((m) => m.type === 'session_state')).toBe(true);
    // Should get prompt_sent, NOT prompt_error, even though broadcast threw inside callback
    expect(messages.some((m) => m.type === 'prompt_sent' && m.message === 'Test')).toBe(true);
  });

  it('sends prompt_error when SDK initialization fails', async () => {
    const sdkHost = {
      create: vi.fn().mockRejectedValue(new Error('Model not found')),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
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

    // Wait for SDK init to fail
    await app.ready;

    // Send prompt - should get prompt_received + session_state + prompt_error
    const allMessages = collectMessages(ws, 3);
    ws.send(JSON.stringify({ type: 'prompt', message: 'Will fail' }));

    const messages = await allMessages;
    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.type === 'prompt_received' && m.message === 'Will fail')).toBe(true);
    expect(messages.some((m) => m.type === 'session_state')).toBe(true);
    const errorMsg = messages.find((m) => m.type === 'prompt_error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg!.message).toBe('Will fail');
    expect(errorMsg!.error).toContain('SDK session initialization failed');
  });
});
