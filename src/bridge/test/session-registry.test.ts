import { describe, expect, it } from 'vitest';
import { createSessionRegistry } from '../session-registry.js';

describe('session registry', () => {
  it('creates a session state with secure defaults', () => {
    const registry = createSessionRegistry(() => 'session-1');

    const session = registry.createSession({ cwd: '/project' });

    expect(session).toEqual({
      id: 'session-1',
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      autoApproveScriptsEnabled: false,
    });
    expect(registry.getCurrentSession()).toEqual(session);
  });

  it('resumes a session from a session path', () => {
    const registry = createSessionRegistry(() => 'session-2');

    const session = registry.resumeSession('/session.jsonl', { cwd: '/project' });

    expect(session.sessionPath).toBe('/session.jsonl');
    expect(session.cwd).toBe('/project');
  });

  it('updates sensitive access toggles', () => {
    const registry = createSessionRegistry(() => 'session-3');
    registry.createSession({ cwd: '/project' });

    registry.setCookieAccess(true);
    registry.setStorageAccess(true);

    expect(registry.getCurrentSession()).toMatchObject({
      cookieAccessEnabled: true,
      storageAccessEnabled: true,
    });
  });

  it('toggles script auto-approval and turns it off for a new session', () => {
    const registry = createSessionRegistry(() => 'session-4');
    registry.createSession({ cwd: '/project' });

    expect(registry.setAutoApproveScripts(true)).toMatchObject({ autoApproveScriptsEnabled: true });
    expect(registry.setAutoApproveScripts(false)).toMatchObject({ autoApproveScriptsEnabled: false });

    registry.setAutoApproveScripts(true);
    expect(registry.createSession({ cwd: '/other' }).autoApproveScriptsEnabled).toBe(false);
    expect(registry.resumeSession('/session.jsonl', { cwd: '/other' }).autoApproveScriptsEnabled).toBe(false);
  });
});
