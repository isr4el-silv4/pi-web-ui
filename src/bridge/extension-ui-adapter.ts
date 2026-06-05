export interface UiResponse {
  id: string;
  value: unknown;
}

export function createExtensionUiAdapter({ broadcast }: { broadcast: (message: Record<string, unknown>) => void }) {
  const pending = new Map<string, (value: unknown) => void>();
  let nextId = 1;

  function request(kind: string, payload: Record<string, unknown>) {
    const id = `ui-${nextId++}`;
    broadcast({ id, type: 'extension_ui_request', kind, ...payload });
    return new Promise<unknown>((resolve) => pending.set(id, resolve));
  }

  return {
    confirm(message: string) {
      return request('confirm', { message }) as Promise<boolean>;
    },
    input(message: string) {
      return request('input', { message }) as Promise<string>;
    },
    notify(message: string) {
      broadcast({ type: 'extension_ui_notify', message });
    },
    respond(response: UiResponse) {
      const resolve = pending.get(response.id);
      if (!resolve) return false;
      pending.delete(response.id);
      resolve(response.value);
      return true;
    },
  };
}
