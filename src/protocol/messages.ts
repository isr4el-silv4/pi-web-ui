import { isPermissionMode, type PermissionMode } from './permissions.js';

export const DEFAULT_BRIDGE_PORT = 43117;

export type ClientCommand =
  | { type: 'prompt'; message: string }
  | { type: 'abort' }
  | { type: 'new_session'; cwd: string }
  | { type: 'resume_session'; sessionPath: string }
  | { type: 'set_permission_mode'; mode: PermissionMode }
  | { type: 'set_cookie_access'; enabled: boolean }
  | { type: 'set_storage_access'; enabled: boolean }
  | { type: 'extension_ui_response'; id: string; value: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isClientCommand(value: unknown): value is ClientCommand {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'prompt':
      return typeof value.message === 'string';
    case 'abort':
      return true;
    case 'new_session':
      return typeof value.cwd === 'string';
    case 'resume_session':
      return typeof value.sessionPath === 'string';
    case 'set_permission_mode':
      return isPermissionMode(value.mode);
    case 'set_cookie_access':
    case 'set_storage_access':
      return typeof value.enabled === 'boolean';
    case 'extension_ui_response':
      return typeof value.id === 'string';
    default:
      return false;
  }
}
