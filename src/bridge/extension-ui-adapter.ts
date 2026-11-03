import { randomUUID } from 'node:crypto';
export interface UiResponse {
  id: string;
  value: unknown;
}

export function createExtensionUiAdapter({ broadcast }: { broadcast: (message: Record<string, unknown>) => void }) {
  const pending = new Map<string, { resolve(value: unknown): void; reject(reason: unknown): void }>();

  function request(kind: string, payload: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
    if (options.signal?.aborted) return Promise.reject(options.signal.reason);
    const id = `ui-${randomUUID()}`;
    return new Promise<unknown>((resolve, reject) => {
      const cleanup = () => {
        if (!pending.delete(id)) return false;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        return true;
      };
      const cancel = (reason: unknown) => {
        if (!cleanup()) return;
        // Chrome 1.4 already understands this invalidation event. Notification is best effort.
        try { broadcast({ type: 'extension_ui_request_timeout', id }); } catch {}
        reject(reason);
      };
      const onAbort = () => cancel(options.signal?.reason ?? new Error('Request canceled'));
      const timer = setTimeout(() => cancel(new Error('Permission request expired')), 30_000);
      pending.set(id, {
        resolve(value) { if (cleanup()) resolve(value); },
        reject: cancel,
      });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) return onAbort();
      try { broadcast({ id, type: 'extension_ui_request', kind, ...payload }); }
      catch (error) { cancel(error); }
    });
  }

  return {
    async confirm(message: string, options?: { signal?: AbortSignal }): Promise<boolean> {
      return (await request('confirm', { message }, options)) === true;
    },
    async input(message: string) {
      return (await request('input', { message })) as string;
    },
    notify(message: string) {
      broadcast({ type: 'extension_ui_notify', message });
    },
    respond(response: UiResponse) {
      const waiter = pending.get(response.id);
      if (!waiter) return false;
      waiter.resolve(response.value);
      return true;
    },
    cancelPending(reason: unknown = new Error('Session canceled')) {
      for (const waiter of pending.values()) waiter.reject(reason);
    },
  };
}
