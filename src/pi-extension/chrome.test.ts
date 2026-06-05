import { describe, expect, it, vi } from 'vitest';
import { createChromeOpener, getChromeCommandCandidates } from './chrome.js';

describe('chrome opener', () => {
  it('uses platform-specific command candidates', () => {
    expect(getChromeCommandCandidates('darwin')[0]).toBe('open');
    expect(getChromeCommandCandidates('win32')[0]).toBe('cmd');
    expect(getChromeCommandCandidates('linux')).toContain('google-chrome');
  });

  it('opens the extension landing URL with bridge port hint', async () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    const opener = createChromeOpener({ spawn, platform: 'linux' });

    await opener.open({ port: 43117 });

    expect(spawn).toHaveBeenCalledWith(
      'google-chrome',
      ['http://localhost:43117/open'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });
});
