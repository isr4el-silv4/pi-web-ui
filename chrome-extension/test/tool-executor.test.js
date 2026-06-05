import { describe, expect, it, vi } from 'vitest';
import { createToolExecutor } from '../tool-executor.js';

describe('chrome browser tool executor', () => {
  it('executes page text and screenshot tools', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1 }]) },
      scripting: { executeScript: vi.fn(async () => [{ result: 'text' }]) },
      tabsCapture: vi.fn(async () => 'data:image/png;base64,x'),
    };
    const executor = createToolExecutor(chrome);

    await expect(executor.execute('page.getText', {})).resolves.toEqual({ text: 'text' });
    await expect(executor.execute('page.captureScreenshot', {})).resolves.toEqual({ dataUrl: 'data:image/png;base64,x' });
  });
});
