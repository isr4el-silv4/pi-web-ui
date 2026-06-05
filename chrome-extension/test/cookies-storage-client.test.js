import { describe, expect, it, vi } from 'vitest';
import { createCookiesClient } from '../cookies-client.js';
import { createStorageClient } from '../storage-client.js';

describe('cookies and storage clients', () => {
  it('reads cookies through chrome cookies api', async () => {
    const chrome = { cookies: { getAll: vi.fn(async () => [{ name: 'sid' }]) } };
    await expect(createCookiesClient(chrome).getCookies({ url: 'https://x.test' })).resolves.toEqual({ cookies: [{ name: 'sid' }] });
  });

  it('reads local and session storage via scripting', async () => {
    const chrome = { scripting: { executeScript: vi.fn(async () => [{ result: { a: 'b' } }]) } };
    const client = createStorageClient(chrome);
    await expect(client.getLocalStorage(1)).resolves.toEqual({ storage: { a: 'b' } });
    await expect(client.getSessionStorage(1)).resolves.toEqual({ storage: { a: 'b' } });
  });
});
