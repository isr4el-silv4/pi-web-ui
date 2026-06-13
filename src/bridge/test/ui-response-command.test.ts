import { describe, expect, it, vi } from 'vitest';
import { createBridgeApp } from '../server.js';

describe('bridge UI response command', () => {
  it('forwards side panel UI responses to adapter', () => {
    const ui = { respond: vi.fn(() => true) };
    const app = createBridgeApp({ context: { cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 }, ui });
    expect(app.handleClientCommand({ type: 'extension_ui_response', id: 'ui-1', value: true })).toEqual({ handled: true });
    expect(ui.respond).toHaveBeenCalledWith({ id: 'ui-1', value: true });
  });
});
