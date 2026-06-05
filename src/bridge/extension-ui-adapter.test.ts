import { describe, expect, it, vi } from 'vitest';
import { createExtensionUiAdapter } from './extension-ui-adapter.js';

describe('extension ui adapter', () => {
  it('broadcasts confirm requests and resolves responses', async () => {
    const broadcast = vi.fn();
    const ui = createExtensionUiAdapter({ broadcast });
    const pending = ui.confirm('Proceed?');
    const id = broadcast.mock.calls[0][0].id;
    ui.respond({ id, value: true });
    await expect(pending).resolves.toBe(true);
  });
});
