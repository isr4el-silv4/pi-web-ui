import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createWebUiContext } from '../web-ui-context.js';

describe('web ui context', () => {
  let broadcast: ReturnType<typeof vi.fn>;
  let ui: ReturnType<typeof createWebUiContext>;

  beforeEach(() => {
    broadcast = vi.fn();
    ui = createWebUiContext({ broadcast });
  });

  it('broadcasts confirm requests and resolves responses', async () => {
    const pending = ui.confirm('Title', 'Proceed?');
    const call = broadcast.mock.calls[0][0] as Record<string, unknown>;
    expect(call.type).toBe('extension_ui_request');
    expect(call.kind).toBe('confirm');
    expect(call.message).toBe('Proceed?');
    const id = call.id as string;
    ui.respond({ id, value: true });
    await expect(pending).resolves.toBe(true);
  });

  it('broadcasts select requests and resolves responses', async () => {
    const pending = ui.select('Choose', ['a', 'b', 'c']);
    const call = broadcast.mock.calls[0][0] as Record<string, unknown>;
    expect(call.kind).toBe('select');
    expect(call.options).toEqual(['a', 'b', 'c']);
    const id = call.id as string;
    ui.respond({ id, value: 'b' });
    await expect(pending).resolves.toBe('b');
  });

  it('broadcasts input requests and resolves responses', async () => {
    const pending = ui.input('Enter name', 'Type here...');
    const call = broadcast.mock.calls[0][0] as Record<string, unknown>;
    expect(call.kind).toBe('input');
    expect(call.placeholder).toBe('Type here...');
    const id = call.id as string;
    ui.respond({ id, value: 'hello' });
    await expect(pending).resolves.toBe('hello');
  });

  it('broadcasts notify as fire-and-forget', () => {
    ui.notify('Task complete');
    const call = broadcast.mock.calls[0][0] as Record<string, unknown>;
    expect(call.type).toBe('extension_ui_notify');
    expect(call.message).toBe('Task complete');
  });

  it('returns false for confirm when cancelled', async () => {
    const pending = ui.confirm('Title', 'Proceed?');
    const id = (broadcast.mock.calls[0][0] as Record<string, unknown>).id as string;
    ui.respond({ id, value: { cancelled: true } });
    await expect(pending).resolves.toBe(false);
  });

  it('returns undefined for select when cancelled', async () => {
    const pending = ui.select('Choose', ['a', 'b']);
    const id = (broadcast.mock.calls[0][0] as Record<string, unknown>).id as string;
    ui.respond({ id, value: { cancelled: true } });
    await expect(pending).resolves.toBeUndefined();
  });

  it('returns undefined for input when cancelled', async () => {
    const pending = ui.input('Enter', '');
    const id = (broadcast.mock.calls[0][0] as Record<string, unknown>).id as string;
    ui.respond({ id, value: { cancelled: true } });
    await expect(pending).resolves.toBeUndefined();
  });

  it('returns false for respond with unknown id', () => {
    expect(ui.respond({ id: 'nonexistent', value: true })).toBe(false);
  });

  it('rejects pending requests on cleanup', async () => {
    const freshBroadcast = vi.fn();
    const freshUi = createWebUiContext({ broadcast: freshBroadcast });
    const p1 = freshUi.confirm('Title', 'Proceed?');
    const p2 = freshUi.select('Choose', ['a']);
    const p3 = freshUi.input('Enter', '');
    let errors: Error[] = [];
    p1.catch((e) => { errors.push(e); });
    p2.catch((e) => { errors.push(e); });
    p3.catch((e) => { errors.push(e); });
    freshUi.cleanup();
    await new Promise((r) => setTimeout(r, 10));
    expect(errors).toHaveLength(3);
    expect(errors[0]?.message).toBe('Session shutdown');
  });

  it('clears all timers on cleanup', () => {
    vi.useFakeTimers();
    const freshBroadcast = vi.fn();
    const freshUi = createWebUiContext({ broadcast: freshBroadcast });
    const p1 = freshUi.confirm('Title', 'Proceed?');
    const p2 = freshUi.select('Choose', ['a']);
    const p3 = freshUi.input('Enter', '');
    p1.catch(() => {});
    p2.catch(() => {});
    p3.catch(() => {});
    expect(freshBroadcast).toHaveBeenCalledTimes(3);
    freshUi.cleanup();
    vi.advanceTimersByTime(60_000);
    expect(freshBroadcast).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('custom returns undefined', async () => {
    await expect(ui.custom()).resolves.toBeUndefined();
  });

  it('theme returns a minimal theme object', () => {
    expect(ui.theme).toEqual({ name: 'default', colors: {} });
  });

  it('getAllThemes returns empty array', () => {
    expect(ui.getAllThemes()).toEqual([]);
  });

  it('setTheme returns failure', () => {
    const result = ui.setTheme({ name: 'dark' });
    expect(result).toEqual({ success: false, error: 'Theme switching not supported in web UI' });
  });

  it('getEditorText returns empty string', () => {
    expect(ui.getEditorText()).toBe('');
  });

  it('getToolsExpanded returns false', () => {
    expect(ui.getToolsExpanded()).toBe(false);
  });

  it('onTerminalInput returns no-op function', () => {
    const fn = ui.onTerminalInput();
    expect(typeof fn).toBe('function');
    fn();
  });
});
