import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPiSdkAdapter, createSdkSessionHost, resolveCwd, createBrowserToolDefinitions } from '../sdk-session.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

describe('createBrowserToolDefinitions', () => {
  it('wraps tool execute result in { content: [...], details: {...} } format expected by Pi SDK', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
    };
    const executor = {
      execute: vi.fn(async (tool, params) => ({ tabs: [{ id: 1, title: 'Test Tab' }] })),
    };

    createBrowserToolDefinitions(sdk, executor);

    // Find the tabs.list tool
    const listTabsTool = createdTools.find((t: any) => t.name === 'browser_list_tabs');
    expect(listTabsTool).toBeDefined();

    // Execute the tool and verify the result format
    const result = await (listTabsTool as any).execute('tool-call-1', {});
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ tabs: [{ id: 1, title: 'Test Tab' }] }) }],
      details: { tabs: [{ id: 1, title: 'Test Tab' }] },
    });
    expect(executor.execute).toHaveBeenCalledWith('tabs.list', {});
  });

  it('passes toolCallId and params to execute function', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
    };
    const executor = {
      execute: vi.fn(async () => ({ text: 'hello' })),
    };

    createBrowserToolDefinitions(sdk, executor);

    const getTextTool = createdTools.find((t: any) => t.name === 'browser_get_page_text');
    expect(getTextTool).toBeDefined();

    await (getTextTool as any).execute('call-123', { tabId: 5 });
    expect(executor.execute).toHaveBeenCalledWith('page.getText', { tabId: 5 });
  });

  it('wraps error results in content array with error text', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
    };
    const executor = {
      execute: vi.fn(async () => { throw new Error('No Chrome extension client connected'); }),
    };

    createBrowserToolDefinitions(sdk, executor);

    const listTabsTool = createdTools.find((t: any) => t.name === 'browser_list_tabs');
    const result = await (listTabsTool as any).execute('tool-call-1', {});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: No Chrome extension client connected' }],
      isError: true,
    });
  });
});

describe('sdk session host', () => {
  it('creates sessions through an injected SDK adapter', async () => {
    const adapter = { createSession: vi.fn(async (options) => ({ id: 'sdk-1', ...options })) };
    const host = createSdkSessionHost(adapter);
    await expect(host.create({ cwd: '/project' })).resolves.toMatchObject({ id: 'sdk-1', cwd: '/project' });
  });

  it('builds a Pi SDK adapter that loads resources and browser tools', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      DefaultResourceLoader: vi.fn(function ResourceLoader(this: { cwd: string }, options: { cwd: string }) { this.cwd = options.cwd; }),
      createAgentSession: vi.fn(async (options) => ({ id: 'agent-session', options })),
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
      discoverAndLoadExtensions: vi.fn(async () => ['extension-a']),
      loadSkills: vi.fn(async () => ['skill-a']),
    };
    const adapter = createPiSdkAdapter({ sdk, browserToolExecutor: { execute: vi.fn() } });

    const session = await adapter.createSession({ cwd: '/project', sessionPath: '/s.jsonl' });

    expect(sdk.DefaultResourceLoader).toHaveBeenCalledWith({ cwd: '/project' });
    expect(sdk.discoverAndLoadExtensions).toHaveBeenCalled();
    expect(sdk.loadSkills).toHaveBeenCalled();
    expect(createdTools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'browser_get_console_logs' })]));
    expect(session).toMatchObject({ id: 'agent-session' });
  });

  it('extracts session from { session } wrapper returned by Pi SDK', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      DefaultResourceLoader: vi.fn(function ResourceLoader(this: { cwd: string }, options: { cwd: string }) { this.cwd = options.cwd; }),
      createAgentSession: vi.fn(async () => ({
        // Pi SDK returns { session } not the session directly
        session: { id: 'real-session', prompt: vi.fn(), subscribe: vi.fn() },
      })),
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
      discoverAndLoadExtensions: vi.fn(async () => []),
      loadSkills: vi.fn(async () => []),
    };
    const adapter = createPiSdkAdapter({ sdk, browserToolExecutor: { execute: vi.fn() } });

    const session = await adapter.createSession({ cwd: '/project' });

    // Should extract the inner session, not return the wrapper
    expect(session).toMatchObject({ id: 'real-session' });
    expect((session as any).prompt).toBeDefined();
    expect((session as any).subscribe).toBeDefined();
  });

  it('uses session directly when not wrapped in { session }', async () => {
    const createdTools: unknown[] = [];
    const sdk = {
      DefaultResourceLoader: vi.fn(function ResourceLoader(this: { cwd: string }, options: { cwd: string }) { this.cwd = options.cwd; }),
      createAgentSession: vi.fn(async () => ({
        // Some SDK versions may return session directly
        id: 'direct-session',
        prompt: vi.fn(),
        subscribe: vi.fn(),
      })),
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
      discoverAndLoadExtensions: vi.fn(async () => []),
      loadSkills: vi.fn(async () => []),
    };
    const adapter = createPiSdkAdapter({ sdk, browserToolExecutor: { execute: vi.fn() } });

    const session = await adapter.createSession({ cwd: '/project' });

    // Should use the session directly
    expect(session).toMatchObject({ id: 'direct-session' });
    expect((session as any).prompt).toBeDefined();
  });

  it('opens existing session via SessionManager when sessionPath is provided', async () => {
    const createdTools: unknown[] = [];
    const mockSessionManager = {
      buildSessionContext: vi.fn(() => ({ messages: [{ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hi' }] })),
    };
    const createAgentSessionOptions: Record<string, unknown>[] = [];
    const sdk = {
      DefaultResourceLoader: vi.fn(function ResourceLoader(this: { cwd: string }, options: { cwd: string }) { this.cwd = options.cwd; }),
      SessionManager: {
        open: vi.fn(() => mockSessionManager),
      },
      createAgentSession: vi.fn(async (options) => {
        createAgentSessionOptions.push(options);
        return { id: 'resumed-session', options };
      }),
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
      discoverAndLoadExtensions: vi.fn(async () => []),
      loadSkills: vi.fn(async () => []),
    };
    const adapter = createPiSdkAdapter({ sdk, browserToolExecutor: { execute: vi.fn() } });

    await adapter.createSession({ cwd: '/project', sessionPath: '/sessions/resume.jsonl' });

    // SessionManager.open should have been called with the session path
    expect(sdk.SessionManager.open).toHaveBeenCalledWith('/sessions/resume.jsonl');
    // buildSessionContext should have been called to log message count
    expect(mockSessionManager.buildSessionContext).toHaveBeenCalled();
    // createAgentSession should receive the sessionManager (not sessionPath)
    expect(createAgentSessionOptions).toHaveLength(1);
    expect(createAgentSessionOptions[0].sessionManager).toBe(mockSessionManager);
    expect(createAgentSessionOptions[0].sessionPath).toBeUndefined();
  });

  it('does not call SessionManager.open when sessionPath is not provided', async () => {
    const createdTools: unknown[] = [];
    const createAgentSessionOptions: Record<string, unknown>[] = [];
    const sdk = {
      DefaultResourceLoader: vi.fn(function ResourceLoader(this: { cwd: string }, options: { cwd: string }) { this.cwd = options.cwd; }),
      SessionManager: {
        open: vi.fn(),
      },
      createAgentSession: vi.fn(async (options) => {
        createAgentSessionOptions.push(options);
        return { id: 'new-session', options };
      }),
      defineTool: vi.fn((tool) => { createdTools.push(tool); return tool; }),
      discoverAndLoadExtensions: vi.fn(async () => []),
      loadSkills: vi.fn(async () => []),
    };
    const adapter = createPiSdkAdapter({ sdk, browserToolExecutor: { execute: vi.fn() } });

    await adapter.createSession({ cwd: '/project' });

    // SessionManager.open should NOT have been called
    expect(sdk.SessionManager.open).not.toHaveBeenCalled();
    // createAgentSession should NOT receive a sessionManager
    expect(createAgentSessionOptions).toHaveLength(1);
    expect(createAgentSessionOptions[0].sessionManager).toBeUndefined();
  });
});

describe('resolveCwd', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-test-'));
  });

  it('returns absolute path as-is when it exists', () => {
    const result = resolveCwd(tmpRoot);
    expect(result).toBe(tmpRoot);
  });

  it('resolves relative path against process.cwd when it exists', () => {
    const subdir = path.join(tmpRoot, 'subdir');
    fs.mkdirSync(subdir);
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      const result = resolveCwd('subdir');
      expect(result).toBe(subdir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('searches home directory when resolved path does not exist', () => {
    // Create a directory in tmpRoot that will act as "home"
    const fakeHome = path.join(tmpRoot, 'home');
    const projectDir = path.join(fakeHome, 'my-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Create a different tmp dir to act as process.cwd (where the relative path won't resolve)
    const fakeCwd = path.join(tmpRoot, 'other-cwd');
    fs.mkdirSync(fakeCwd, { recursive: true });
    const originalCwd = process.cwd();
    try {
      process.chdir(fakeCwd);
      // 'my-project' doesn't exist in fakeCwd, but does exist in fakeHome
      const result = resolveCwd('my-project', fakeHome);
      expect(result).toBe(projectDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('searches common home subdirectories (Desktop, Documents, IdeaProjects, etc.)', () => {
    const fakeHome = path.join(tmpRoot, 'home');
    const ideaProjects = path.join(fakeHome, 'IdeaProjects');
    const projectDir = path.join(ideaProjects, 'my-app');
    fs.mkdirSync(projectDir, { recursive: true });

    const fakeCwd = path.join(tmpRoot, 'other-cwd');
    fs.mkdirSync(fakeCwd, { recursive: true });
    const originalCwd = process.cwd();
    try {
      process.chdir(fakeCwd);
      const result = resolveCwd('my-app', fakeHome);
      expect(result).toBe(projectDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('searches parent of process.cwd()', () => {
    // Create project in tmpRoot
    const projectDir = path.join(tmpRoot, 'my-project');
    fs.mkdirSync(projectDir, { recursive: true });

    // Set process.cwd to a subdir of tmpRoot
    const fakeCwd = path.join(tmpRoot, 'subdir');
    fs.mkdirSync(fakeCwd, { recursive: true });
    const originalCwd = process.cwd();
    try {
      process.chdir(fakeCwd);
      // 'my-project' doesn't exist in fakeCwd, but exists in parent (tmpRoot)
      const result = resolveCwd('my-project', path.join(tmpRoot, 'fake-home'));
      expect(result).toBe(projectDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('returns resolved path even when it does not exist (no fallback found)', () => {
    const nonExistent = path.join(tmpRoot, 'does-not-exist-' + crypto.randomUUID());
    const result = resolveCwd(nonExistent);
    // Should return the resolved path even if it doesn't exist
    expect(result).toBe(nonExistent);
  });

  it('returns resolved relative path when it does not exist and no home fallback', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      const result = resolveCwd('nonexistent-dir');
      expect(result).toBe(path.join(tmpRoot, 'nonexistent-dir'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('prefers resolved path over home directory search', () => {
    // Create 'my-project' in both tmpRoot (process.cwd) and a fake home
    const fakeHome = path.join(tmpRoot, 'home');
    const projectInCwd = path.join(tmpRoot, 'my-project');
    const projectInHome = path.join(fakeHome, 'my-project');
    fs.mkdirSync(projectInCwd, { recursive: true });
    fs.mkdirSync(projectInHome, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      // Should prefer the resolved path (in cwd) over home search
      const result = resolveCwd('my-project', fakeHome);
      expect(result).toBe(projectInCwd);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('handles root path "/"', () => {
    const result = resolveCwd('/');
    expect(result).toBe('/');
  });
});
