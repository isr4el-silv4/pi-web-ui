import { describe, expect, it, vi } from 'vitest';
import { createChromeOpener, getChromeCommandCandidates } from '../chrome.js';

function makeMockChild(options: { emitError?: boolean; emitExitCode?: number }) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const child = {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      if (options.emitError && listeners.error) {
        const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        err.errno = -2;
        listeners.error[0](err);
      }
      if (options.emitExitCode !== undefined && listeners.exit) {
        listeners.exit[0](options.emitExitCode);
      }
      return child;
    }),
    unref: vi.fn(),
    listeners: () => listeners,
  };
  return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
}

describe('chrome opener', () => {
  it('uses platform-specific command candidates', () => {
    expect(getChromeCommandCandidates('darwin')[0]).toBe('open');
    expect(getChromeCommandCandidates('win32')[0]).toBe('cmd');
    expect(getChromeCommandCandidates('linux')).toContain('google-chrome');
  });

  it('opens the extension landing URL with bridge port hint', async () => {
    const spawn = vi.fn(() => makeMockChild({ emitExitCode: 0 }));
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenCalledWith(
      'google-chrome',
      ['http://localhost:43117/open'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('tries next candidate when first spawn emits ENOENT error', async () => {
    let callCount = 0;
    const spawn = vi.fn(() => {
      callCount++;
      if (callCount === 1) return makeMockChild({ emitError: true });
      return makeMockChild({ emitExitCode: 0 });
    });
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenNthCalledWith(1, 'google-chrome', expect.any(Array), expect.any(Object));
    expect(spawn).toHaveBeenNthCalledWith(2, 'google-chrome-stable', expect.any(Array), expect.any(Object));
  });

  it('tries vivaldi-stable before xdg-open on linux', async () => {
    let callCount = 0;
    const spawn = vi.fn(() => {
      callCount++;
      // fail until vivaldi-stable (5th candidate)
      if (callCount <= 4) return makeMockChild({ emitError: true });
      return makeMockChild({ emitExitCode: 0 });
    });
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenNthCalledWith(5, 'vivaldi-stable', expect.any(Array), expect.any(Object));
  });

  it('throws a helpful error when no candidate is found', async () => {
    const spawn = vi.fn(() => makeMockChild({ emitError: true }));
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await expect(opener.open({ port: 43117 })).rejects.toThrow('browser not found');
  });

  it('re-throws non-ENOENT errors immediately', async () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const child = {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(fn);
        if (event === 'error' && listeners.error.length > 0) {
          const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          listeners.error[0](err);
        }
        return child;
      }),
      unref: vi.fn(),
    };
    const spawn = vi.fn(() => child as unknown as ReturnType<typeof import('node:child_process').spawn>);
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await expect(opener.open({ port: 43117 })).rejects.toThrow('permission denied');
  });

  it('uses open -a Google Chrome on macOS', async () => {
    const spawn = vi.fn(() => makeMockChild({ emitExitCode: 0 }));
    const opener = createChromeOpener({ spawn, platform: 'darwin' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenCalledWith(
      'open',
      ['-a', 'Google Chrome', 'http://localhost:43117/open'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('uses cmd /c start chrome on Windows', async () => {
    const spawn = vi.fn(() => makeMockChild({ emitExitCode: 0 }));
    const opener = createChromeOpener({ spawn, platform: 'win32' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', 'chrome', 'http://localhost:43117/open'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('includes vivaldi and xdg-open in linux candidates', () => {
    const candidates = getChromeCommandCandidates('linux');
    expect(candidates).toContain('vivaldi-stable');
    expect(candidates).toContain('vivaldi');
    expect(candidates).toContain('xdg-open');
  });

  it('falls back to xdg-open when no chromium-based browser is found', async () => {
    let callCount = 0;
    const spawn = vi.fn(() => {
      callCount++;
      // all fail except last (xdg-open, call #7)
      if (callCount < 7) return makeMockChild({ emitError: true });
      return makeMockChild({ emitExitCode: 0 });
    });
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenLastCalledWith('xdg-open', expect.any(Array), expect.any(Object));
  });
});
