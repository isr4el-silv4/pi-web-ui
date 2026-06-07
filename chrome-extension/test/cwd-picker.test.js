import { describe, expect, it, vi } from 'vitest';
import { resolveCwdPath } from '../cwd-picker.js';

describe('cwd picker', () => {
  describe('resolveCwdPath', () => {
    it('returns display path when chrome.fileSystem.getDisplayPath succeeds', async () => {
      const fakeEntry = { name: 'my-project' };
      const fakeHandle = {
        name: 'my-project',
        getAsEntry: () => fakeEntry,
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn((entry, callback) => {
            callback('/home/user/my-project');
          }),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('/home/user/my-project');
      expect(fakeChrome.fileSystem.getDisplayPath).toHaveBeenCalledWith(fakeEntry, expect.any(Function));
    });

    it('returns directory name when getAsEntry is not available', async () => {
      const fakeHandle = {
        name: 'my-project',
        // getAsEntry is not defined
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn(),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('my-project');
    });

    it('returns directory name when getDisplayPath throws an error', async () => {
      const fakeEntry = { name: 'my-project' };
      const fakeHandle = {
        name: 'my-project',
        getAsEntry: () => fakeEntry,
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn((entry, callback) => {
            throw new Error('getDisplayPath not supported');
          }),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('my-project');
    });

    it('returns directory name when getDisplayPath callback is not called', async () => {
      const fakeEntry = { name: 'test-dir' };
      const fakeHandle = {
        name: 'test-dir',
        getAsEntry: () => fakeEntry,
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn(() => {
            // callback is never called - simulates API not working
          }),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('test-dir');
    });

    it('returns directory name when chrome.fileSystem is not available', async () => {
      const fakeHandle = {
        name: 'fallback-dir',
        getAsEntry: undefined,
      };

      const fakeChrome = {};

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('fallback-dir');
    });

    it('returns directory name when getAsEntry throws', async () => {
      const fakeHandle = {
        name: 'error-dir',
        getAsEntry: () => { throw new Error('getAsEntry failed'); },
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn(),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('error-dir');
    });

    it('handles promise-based getDisplayPath', async () => {
      const fakeEntry = { name: 'promise-dir' };
      const fakeHandle = {
        name: 'promise-dir',
        getAsEntry: () => fakeEntry,
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn((entry) => {
            return Promise.resolve('/path/from/promise');
          }),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('/path/from/promise');
    });

    it('handles promise-based getAsEntry (newer Chrome versions)', async () => {
      const fakeEntry = { name: 'async-entry-dir' };
      const fakeHandle = {
        name: 'async-entry-dir',
        getAsEntry: () => Promise.resolve(fakeEntry),
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn((entry, callback) => {
            callback('/path/from/async-entry');
          }),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('/path/from/async-entry');
      expect(fakeChrome.fileSystem.getDisplayPath).toHaveBeenCalledWith(fakeEntry, expect.any(Function));
    });

    it('returns directory name when promise-based getAsEntry rejects', async () => {
      const fakeHandle = {
        name: 'reject-dir',
        getAsEntry: () => Promise.reject(new Error('getAsEntry async failed')),
      };

      const fakeChrome = {
        fileSystem: {
          getDisplayPath: vi.fn(),
        },
      };

      const result = await resolveCwdPath(fakeHandle, fakeChrome);
      expect(result).toBe('reject-dir');
    });
  });
});
