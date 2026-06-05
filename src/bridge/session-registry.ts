import type { PermissionMode, SessionState } from '../protocol/index.js';

export interface CreateSessionOptions {
  cwd: string;
  sessionPath?: string;
  permissionMode?: PermissionMode;
  cookieAccessEnabled?: boolean;
  storageAccessEnabled?: boolean;
}

export interface SessionRegistry {
  createSession(options: CreateSessionOptions): SessionState;
  resumeSession(sessionPath: string, options: Omit<CreateSessionOptions, 'sessionPath'>): SessionState;
  getCurrentSession(): SessionState | undefined;
  setPermissionMode(mode: PermissionMode): SessionState;
  setCookieAccess(enabled: boolean): SessionState;
  setStorageAccess(enabled: boolean): SessionState;
}

export function createSessionRegistry(createId: () => string = () => crypto.randomUUID()): SessionRegistry {
  let current: SessionState | undefined;

  function requireCurrent(): SessionState {
    if (!current) throw new Error('No active Pi Web UI session');
    return current;
  }

  return {
    createSession(options) {
      current = {
        id: createId(),
        cwd: options.cwd,
        ...(options.sessionPath ? { sessionPath: options.sessionPath } : {}),
        permissionMode: options.permissionMode ?? 'debug',
        cookieAccessEnabled: options.cookieAccessEnabled ?? false,
        storageAccessEnabled: options.storageAccessEnabled ?? false,
      };
      return current;
    },
    resumeSession(sessionPath, options) {
      return this.createSession({ ...options, sessionPath });
    },
    getCurrentSession() {
      return current;
    },
    setPermissionMode(mode) {
      current = { ...requireCurrent(), permissionMode: mode };
      return current;
    },
    setCookieAccess(enabled) {
      current = { ...requireCurrent(), cookieAccessEnabled: enabled };
      return current;
    },
    setStorageAccess(enabled) {
      current = { ...requireCurrent(), storageAccessEnabled: enabled };
      return current;
    },
  };
}
