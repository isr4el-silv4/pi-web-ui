import { describe, expect, it, vi } from 'vitest';
import { createPiSdkAdapter, createSdkSessionHost } from '../sdk-session.js';

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
});
