import * as crypto from 'node:crypto';
import type { JsonObject } from '../protocol/index.js';

/**
 * ExtensionUIContext implementation that delegates all UI operations
 * to the Chrome extension via WebSocket broadcast.
 */
export function createWebUiContext({ broadcast }: { broadcast: (message: JsonObject) => void }) {
  const pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const UI_REQUEST_TIMEOUT_MS = 30_000;

  function request<T>(kind: string, payload: Record<string, unknown>, parseResponse: (r: unknown) => T, defaultValue: T): Promise<T> {
    const id = crypto.randomUUID();
    broadcast({ id, type: 'extension_ui_request', kind, ...payload } as JsonObject);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(defaultValue);
      }, UI_REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); pending.delete(id); resolve(parseResponse(v) as T); }, reject, timer });
    });
  }

  function cleanup() {
    for (const [id, { reject, timer }] of pending) {
      clearTimeout(timer);
      reject(new Error('Session shutdown'));
      pending.delete(id);
    }
  }

  return {
    select(title: string, options: string[], _opts?: unknown): Promise<string | undefined> {
      return request('select', { title, options }, (r: any) => {
        if (typeof r === 'string') return r;
        if (typeof r === 'object' && r !== null) {
          if ('cancelled' in r && r.cancelled) return undefined;
          if ('value' in r) return r.value ?? undefined;
        }
        return undefined;
      }, undefined);
    },
    confirm(title: string, message: string, _opts?: unknown): Promise<boolean> {
      return request('confirm', { title, message }, (r: any) => {
        if (typeof r === 'object' && r !== null) {
          if ('cancelled' in r && r.cancelled) return false;
          if ('confirmed' in r) return r.confirmed ?? false;
          if ('value' in r) return Boolean(r.value);
        }
        return typeof r === 'boolean' ? r : false;
      }, false);
    },
    input(title: string, placeholder: string, _opts?: unknown): Promise<string | undefined> {
      return request('input', { title, placeholder }, (r: any) => {
        if (typeof r === 'object' && r !== null) {
          if ('cancelled' in r && r.cancelled) return undefined;
          if ('value' in r) return r.value ?? undefined;
        }
        return typeof r === 'string' ? r : undefined;
      }, undefined);
    },
    notify(message: string, _type?: string) {
      broadcast({ type: 'extension_ui_notify', message } as JsonObject);
    },
    onTerminalInput(): () => void {
      return () => {};
    },
    setStatus(_key: string, _text: string) {
      // TUI-specific — no-op
    },
    setWorkingMessage(_message: string) {
      // TUI-specific — no-op
    },
    setWorkingVisible(_visible: boolean) {
      // TUI-specific — no-op
    },
    setWorkingIndicator(_options: unknown) {
      // TUI-specific — no-op
    },
    setHiddenThinkingLabel(_label: string) {
      // TUI-specific — no-op
    },
    setWidget(_key: string, _content: unknown, _options?: unknown) {
      // TUI-specific — no-op
    },
    setFooter(_factory: unknown) {
      // TUI-specific — no-op
    },
    setHeader(_factory: unknown) {
      // TUI-specific — no-op
    },
    setTitle(_title: string) {
      // Not supported in web UI
    },
    async custom(): Promise<undefined> {
      // TUI-only — not supported
      return undefined;
    },
    pasteToEditor(_text: string) {
      // Not supported in web UI
    },
    setEditorText(_text: string) {
      // Not supported in web UI
    },
    getEditorText(): string {
      return '';
    },
    async editor(_title: string, _prefill?: string): Promise<string | undefined> {
      // Multi-line editor not supported in web UI
      return undefined;
    },
    addAutocompleteProvider() {
      // Not supported in web UI
    },
    setEditorComponent() {
      // Not supported in web UI
    },
    getEditorComponent() {
      return undefined;
    },
    get theme() {
      return {
        name: 'default',
        colors: {},
      };
    },
    getAllThemes(): Array<{ name: string }> {
      return [];
    },
    getTheme(_name: string) {
      return undefined;
    },
    setTheme(_theme: unknown) {
      return { success: false, error: 'Theme switching not supported in web UI' };
    },
    getToolsExpanded(): boolean {
      return false;
    },
    setToolsExpanded(_expanded: boolean) {
      // Not supported in web UI
    },
    respond(response: { id: string; value: unknown }): boolean {
      const pendingRequest = pending.get(response.id);
      if (!pendingRequest) return false;
      pendingRequest.resolve(response.value);
      return true;
    },
    cleanup,
  };
}
