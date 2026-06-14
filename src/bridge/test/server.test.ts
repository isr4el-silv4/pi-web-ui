import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createBridgeApp } from '../server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('bridge app', () => {
  it('reports bridge status with active session and client count', () => {
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      pid: 999,
    });

    expect(app.status()).toEqual({
      running: true,
      pid: 999,
      port: 43117,
      browserClients: 0,
      session: expect.objectContaining({ cwd: '/project' }),
    });
  });

  it('handles side panel commands by updating session state', () => {
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      pid: 999,
    });

    expect(app.handleClientCommand({ type: 'set_cookie_access', enabled: true })).toMatchObject({ cookieAccessEnabled: true });
    expect(app.handleClientCommand({ type: 'new_session', cwd: '/other' })).toMatchObject({ cwd: '/other' });
  });
});

describe('resume_session uses session cwd', () => {
  let tmpDir: string;
  let sessionFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-cwd-test-'));
    sessionFilePath = path.join(tmpDir, 'session.jsonl');
  });

  it('uses cwd from session file header instead of context cwd', () => {
    // Create a session file with a different cwd than the context
    const sessionCwd = path.join(tmpDir, 'session-project');
    fs.mkdirSync(sessionCwd, { recursive: true });
    const header = JSON.stringify({ 
      type: 'session', 
      version: 3, 
      id: 'test-id', 
      timestamp: new Date().toISOString(), 
      cwd: sessionCwd 
    });
    // Add a user message entry so buildSessionHistory has content
    const userMsg = JSON.stringify({ type: 'message', id: 'msg-1', parentId: null, timestamp: new Date().toISOString(), message: { role: 'user', content: 'Hello' } });
    fs.writeFileSync(sessionFilePath, `${header}\n${userMsg}\n`);

    // Create app with a different context cwd
    const contextCwd = path.join(tmpDir, 'context-project');
    fs.mkdirSync(contextCwd, { recursive: true });

    const mockSdkHost = {
      create: vi.fn(async () => ({ id: 'sdk-session', prompt: vi.fn(), subscribe: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: contextCwd, cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost: mockSdkHost,
    });

    // Resume the session
    const session = app.handleClientCommand({ type: 'resume_session', sessionPath: sessionFilePath });

    // The session should use the session file's cwd, not the context cwd
    expect(session).toMatchObject({ cwd: sessionCwd });
    expect(session).not.toMatchObject({ cwd: contextCwd });

    // Verify sdkHost.create was called with the session's cwd
    expect(mockSdkHost.create).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: sessionCwd, sessionPath: sessionFilePath })
    );
  });

  it('falls back to context cwd when session file has no cwd', () => {
    // Create a session file without cwd in header (old format)
    const header = JSON.stringify({ 
      type: 'session', 
      version: 1, 
      id: 'test-id', 
      timestamp: new Date().toISOString()
      // No cwd field
    });
    const userMsg = JSON.stringify({ type: 'message', id: 'msg-1', parentId: null, timestamp: new Date().toISOString(), message: { role: 'user', content: 'Hello' } });
    fs.writeFileSync(sessionFilePath, `${header}\n${userMsg}\n`);

    const contextCwd = path.join(tmpDir, 'context-project');
    fs.mkdirSync(contextCwd, { recursive: true });

    const mockSdkHost = {
      create: vi.fn(async () => ({ id: 'sdk-session', prompt: vi.fn(), subscribe: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: contextCwd, cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost: mockSdkHost,
    });

    // Resume the session
    const session = app.handleClientCommand({ type: 'resume_session', sessionPath: sessionFilePath });

    // Should fall back to context cwd
    expect(session).toMatchObject({ cwd: contextCwd });

    // Verify sdkHost.create was called with the context cwd as fallback
    expect(mockSdkHost.create).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: contextCwd, sessionPath: sessionFilePath })
    );
  });

  it('falls back to context cwd when session file does not exist', () => {
    const contextCwd = path.join(tmpDir, 'context-project');
    fs.mkdirSync(contextCwd, { recursive: true });

    const mockSdkHost = {
      create: vi.fn(async () => ({ id: 'sdk-session', prompt: vi.fn(), subscribe: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: contextCwd, cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost: mockSdkHost,
    });

    // Resume a non-existent session
    const session = app.handleClientCommand({ type: 'resume_session', sessionPath: '/nonexistent/session.jsonl' });

    // Should fall back to context cwd
    expect(session).toMatchObject({ cwd: contextCwd });
  });

  it('broadcasts session_history with cwd from session file', async () => {
    // Create a session file with a specific cwd
    const sessionCwd = path.join(tmpDir, 'broadcast-test-project');
    fs.mkdirSync(sessionCwd, { recursive: true });
    const header = JSON.stringify({ 
      type: 'session', 
      version: 3, 
      id: 'test-id', 
      timestamp: new Date().toISOString(), 
      cwd: sessionCwd 
    });
    const userMsg = JSON.stringify({ type: 'message', id: 'msg-1', parentId: null, timestamp: new Date().toISOString(), message: { role: 'user', content: 'Test message' } });
    fs.writeFileSync(sessionFilePath, `${header}\n${userMsg}\n`);

    const contextCwd = path.join(tmpDir, 'context-project');
    fs.mkdirSync(contextCwd, { recursive: true });

    const mockSdkHost = {
      create: vi.fn(async () => ({ id: 'sdk-session', prompt: vi.fn(), subscribe: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: contextCwd, cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost: mockSdkHost,
    });

    // Capture broadcasted events
    const broadcastedEvents: unknown[] = [];
    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      broadcastedEvents.push(event);
    });

    // Resume the session
    app.handleClientCommand({ type: 'resume_session', sessionPath: sessionFilePath });

    // Wait for async buildSessionHistory to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Find the session_history event
    const sessionHistoryEvent = broadcastedEvents.find((e: any) => e.type === 'session_history');
    expect(sessionHistoryEvent).toBeDefined();
    expect((sessionHistoryEvent as any).cwd).toBe(sessionCwd);
  });
});

describe('bridge app abort', () => {
  it('broadcasts abort_received when abort command is received', () => {
    const events: unknown[] = [];
    const sdkHost = {
      create: vi.fn(async () => ({ prompt: vi.fn(), subscribe: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    const originalBroadcast = app.browserClients.broadcast.bind(app.browserClients);
    app.browserClients.broadcast = vi.fn((event: any) => {
      events.push(event);
      return originalBroadcast(event);
    });

    app.handleClientCommand({ type: 'abort' });

    expect(events).toContainEqual({ type: 'abort_received' });
  });

  it('calls sdkSession.abort() when SDK session is ready', async () => {
    const abortFn = vi.fn().mockResolvedValue(undefined);
    const sdkHost = {
      create: vi.fn(async () => ({ prompt: vi.fn(), subscribe: vi.fn(), abort: abortFn })),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    app.handleClientCommand({ type: 'abort' });

    // Abort is called synchronously — no timeout needed
    expect(abortFn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when sdkSession has no abort method', async () => {
    const sdkHost = {
      create: vi.fn(async () => ({ prompt: vi.fn(), subscribe: vi.fn() })), // no abort
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    // Should not throw
    expect(() => app.handleClientCommand({ type: 'abort' })).not.toThrow();
  });

  it('broadcasts bridge_error when sdkSession.abort() fails', async () => {
    const abortFn = vi.fn().mockRejectedValue(new Error('Abort failed for some reason'));
    const sdkHost = {
      create: vi.fn(async () => ({ prompt: vi.fn(), subscribe: vi.fn(), abort: abortFn })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    // Wait for SDK session to be ready
    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    app.handleClientCommand({ type: 'abort' });

    // Wait for ready.then() + abort().catch() chain to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const errorEvent = events.find((e: any) => e.type === 'bridge_error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any).error).toContain('Abort failed:');
  });

  it('still broadcasts abort_received even when SDK session is not ready', () => {
    const events: unknown[] = [];
    const sdkHost = {
      create: vi.fn(async () => ({ prompt: vi.fn(), subscribe: vi.fn(), abort: vi.fn() })),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    const originalBroadcast = app.browserClients.broadcast.bind(app.browserClients);
    app.browserClients.broadcast = vi.fn((event: any) => {
      events.push(event);
      return originalBroadcast(event);
    });

    // Don't wait for ready — send abort immediately
    app.handleClientCommand({ type: 'abort' });

    // abort_received should be broadcast immediately
    expect(events).toContainEqual({ type: 'abort_received' });
  });

  it('does NOT broadcast assistant_message for message_end with stopReason "aborted"', async () => {
    // Capture the subscribe callback so we can simulate SDK events
    let subscribeCallback: ((event: any) => void) | undefined;
    const sdkHost = {
      create: vi.fn(async () => ({
        prompt: vi.fn(),
        subscribe: vi.fn((cb: (event: any) => void) => {
          subscribeCallback = cb;
          return () => {};
        }),
        abort: vi.fn(),
      })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // Simulate SDK emitting a message_end with stopReason "aborted" and partial text
    subscribeCallback?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'This is a partial response that was aborted' }],
        stopReason: 'aborted',
        errorMessage: 'Request was aborted',
      },
    });

    // Verify that assistant_message was NOT broadcast
    const assistantMessages = events.filter((e: any) => e.type === 'assistant_message');
    expect(assistantMessages).toHaveLength(0);
  });

  it('does NOT broadcast assistant_message after abort even with stopReason "end_turn"', async () => {
    // This is the real-world scenario: user clicks abort, but the model finishes
    // generating before the abort signal reaches the provider
    let subscribeCallback: ((event: any) => void) | undefined;
    const sdkHost = {
      create: vi.fn(async () => ({
        prompt: vi.fn(),
        subscribe: vi.fn((cb: (event: any) => void) => {
          subscribeCallback = cb;
          return () => {};
        }),
        abort: vi.fn().mockResolvedValue(undefined),
      })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // User clicks abort
    app.handleClientCommand({ type: 'abort' });

    // Model finishes normally (stopReason: "end_turn") — should still be suppressed
    subscribeCallback?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'This is a complete response that arrived after abort' }],
        stopReason: 'end_turn',
      },
    });

    // Verify that assistant_message was NOT broadcast
    const assistantMessages = events.filter((e: any) => e.type === 'assistant_message');
    expect(assistantMessages).toHaveLength(0);
  });

  it('resets abort flag on new prompt so the next response is allowed', async () => {
    let subscribeCallback: ((event: any) => void) | undefined;
    const sdkHost = {
      create: vi.fn(async () => ({
        prompt: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn((cb: (event: any) => void) => {
          subscribeCallback = cb;
          return () => {};
        }),
        abort: vi.fn().mockResolvedValue(undefined),
      })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // User aborts
    app.handleClientCommand({ type: 'abort' });

    // Then sends a new prompt (which resets the abort flag)
    app.handleClientCommand({ type: 'prompt', message: 'New question' });

    // Now the response should be allowed through
    subscribeCallback?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Response to the new prompt' }],
        stopReason: 'end_turn',
      },
    });

    const assistantMessages = events.filter((e: any) => e.type === 'assistant_message');
    expect(assistantMessages).toHaveLength(1);
    expect((assistantMessages[0] as any).text).toBe('Response to the new prompt');
  });

  it('DOES broadcast assistant_message for normal message_end without stopReason "aborted"', async () => {
    // Capture the subscribe callback so we can simulate SDK events
    let subscribeCallback: ((event: any) => void) | undefined;
    const sdkHost = {
      create: vi.fn(async () => ({
        prompt: vi.fn(),
        subscribe: vi.fn((cb: (event: any) => void) => {
          subscribeCallback = cb;
          return () => {};
        }),
        abort: vi.fn(),
      })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // Simulate SDK emitting a normal message_end (not aborted)
    subscribeCallback?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'This is a normal response' }],
        stopReason: 'end_turn',
      },
    });

    // Verify that assistant_message WAS broadcast
    const assistantMessages = events.filter((e: any) => e.type === 'assistant_message');
    expect(assistantMessages).toHaveLength(1);
    expect((assistantMessages[0] as any).text).toBe('This is a normal response');
  });

  it('DOES broadcast assistant_message for message_end with stopReason "error" (not aborted)', async () => {
    // Error messages that are NOT abort-related should still be broadcast
    let subscribeCallback: ((event: any) => void) | undefined;
    const sdkHost = {
      create: vi.fn(async () => ({
        prompt: vi.fn(),
        subscribe: vi.fn((cb: (event: any) => void) => {
          subscribeCallback = cb;
          return () => {};
        }),
        abort: vi.fn(),
      })),
    };

    const events: unknown[] = [];
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // Simulate SDK emitting a message_end with stopReason "error" (not aborted)
    subscribeCallback?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Error response text' }],
        stopReason: 'error',
        errorMessage: 'Some error occurred',
      },
    });

    // Error messages should still be broadcast (only "aborted" is filtered)
    const assistantMessages = events.filter((e: any) => e.type === 'assistant_message');
    expect(assistantMessages).toHaveLength(1);
    expect((assistantMessages[0] as any).text).toBe('Error response text');
  });
});
