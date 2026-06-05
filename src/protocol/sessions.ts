import type { PermissionMode } from './permissions.js';

export interface SessionStartOptions {
  cwd: string;
  sessionPath?: string;
  permissionMode: PermissionMode;
  cookieAccessEnabled: boolean;
  storageAccessEnabled: boolean;
}

export interface SessionState {
  id: string;
  cwd: string;
  sessionPath?: string;
  permissionMode: PermissionMode;
  cookieAccessEnabled: boolean;
  storageAccessEnabled: boolean;
}
