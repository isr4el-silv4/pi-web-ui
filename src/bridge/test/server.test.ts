import { describe, expect, it, vi, beforeEach } from 'vitest';
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
    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: unknown) => {
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
