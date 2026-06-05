import { describe, expect, it } from 'vitest';
import { createSessionRegistry } from '../session-registry.js';

describe('session registry', () => {
  it('creates a session state with secure defaults', () => {
    const registry = createSessionRegistry(() => 'session-1');

    const session = registry.createSession({ cwd: '/project' });

    expect(session).toEqual({
      id: 'session-1',
      cwd: '/project',
      permissionMode: 'debug',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
    });
    expect(registry.getCurrentSession()).toEqual(session);
  });

  it('resumes a session from a session path', () => {
    const registry = createSessionRegistry(() => 'session-2');

    const session = registry.resumeSession('/session.jsonl', { cwd: '/project' });

    expect(session.sessionPath).toBe('/session.jsonl');
    expect(session.cwd).toBe('/project');
  });

  it('updates permission and sensitive access toggles', () => {
    const registry = createSessionRegistry(() => 'session-3');
    registry.createSession({ cwd: '/project' });

    registry.setPermissionMode('control');
    registry.setCookieAccess(true);
    registry.setStorageAccess(true);

    expect(registry.getCurrentSession()).toMatchObject({
      permissionMode: 'control',
      cookieAccessEnabled: true,
      storageAccessEnabled: true,
    });
  });
});
