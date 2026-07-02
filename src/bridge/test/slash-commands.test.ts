import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createBridgeApp } from '../server.js';

describe('bridge slash commands', () => {
  it('handles /compact command', async () => {
    const events: unknown[] = [];
    const compactFn = vi.fn().mockResolvedValue(undefined);

    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn(),
        subscribe: vi.fn(),
        compact: compactFn,
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    // Intercept broadcasts
    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // Send /compact command
    await app.handleClientCommand({ type: 'prompt', message: '/compact' });

    // Verify compact was called
    expect(compactFn).toHaveBeenCalledTimes(1);

    // Verify compaction_done event was broadcast
    const compactionEvent = events.find((e: any) => e.type === 'compaction_done');
    expect(compactionEvent).toBeDefined();

    // Verify prompt was NOT forwarded to SDK
    const sdkSession = sdkHost.create.mock.results[0].value;
    const promptFn = (await sdkSession).prompt;
    expect(promptFn).not.toHaveBeenCalled();
  });

  it('handles /thinking command', async () => {
    const events: unknown[] = [];
    const cycleThinkingFn = vi.fn().mockResolvedValue({ thinkingLevel: 'high' });

    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn(),
        subscribe: vi.fn(),
        cycleThinkingLevel: cycleThinkingFn,
        thinkingLevel: 'medium',
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    // Intercept broadcasts
    vi.spyOn(app.browserClients, 'broadcast').mockImplementation((event: any) => {
      events.push(event);
    });

    // Send /thinking command
    await app.handleClientCommand({ type: 'prompt', message: '/thinking' });

    // Verify cycleThinkingLevel was called
    expect(cycleThinkingFn).toHaveBeenCalledTimes(1);

    // Verify thinking_changed event was broadcast
    const thinkingEvent = events.find((e: any) => e.type === 'thinking_changed');
    expect(thinkingEvent).toBeDefined();
    expect((thinkingEvent as any).level).toBe('high');

    // Verify prompt was NOT forwarded to SDK
    const sdkSession = sdkHost.create.mock.results[0].value;
    const promptFn = (await sdkSession).prompt;
    expect(promptFn).not.toHaveBeenCalled();
  });

  it('forwards non-slash-command prompts to SDK normally', async () => {
    const promptFn = vi.fn().mockResolvedValue(undefined);

    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: promptFn,
        subscribe: vi.fn(),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    // Send a normal prompt
    await app.handleClientCommand({ type: 'prompt', message: 'Hello, world!' });

    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify prompt WAS forwarded to SDK
    expect(promptFn).toHaveBeenCalledWith('Hello, world!');
  });

  it('forwards unknown slash commands to SDK normally', async () => {
    const promptFn = vi.fn().mockResolvedValue(undefined);

    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: promptFn,
        subscribe: vi.fn(),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;

    // Send an unknown slash command
    await app.handleClientCommand({ type: 'prompt', message: '/unknown-command' });

    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify prompt WAS forwarded to SDK (unknown commands pass through)
    expect(promptFn).toHaveBeenCalledWith('/unknown-command');
  });
});
