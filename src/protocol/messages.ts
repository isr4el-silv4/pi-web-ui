import { isPermissionMode, type PermissionMode } from './permissions.js';

export const DEFAULT_BRIDGE_PORT = 43117;

export type ClientCommand =
  | { type: 'prompt'; message: string }
  | { type: 'abort' }
  | { type: 'new_session'; cwd: string }
  | { type: 'resume_session'; sessionPath: string }
  | { type: 'list_sessions'; cwd: string }
  | { type: 'set_permission_mode'; mode: PermissionMode }
  | { type: 'set_cookie_access'; enabled: boolean }
  | { type: 'set_storage_access'; enabled: boolean }
  | { type: 'extension_ui_response'; id: string; value: unknown };

export type SessionHistoryMessage =
  | { role: 'user'; text: string; image?: { data: string; mimeType: string } }
  | { role: 'assistant'; text: string; thinking?: string }
  | { role: 'tool'; toolName: string; toolResult: string; isError: boolean }
  | { role: 'bash'; command: string; output: string; exitCode: number | null; isError: boolean }
  | { role: 'compaction'; summary: string; tokensBefore: number };

export type ServerEvent =
  | { type: 'session_state'; session: unknown }
  | { type: 'prompt_received'; message: string }
  | { type: 'prompt_sent'; message: string }
  | { type: 'prompt_error'; message: string; error: string }
  | { type: 'assistant_message'; text: string }
  | { type: 'tool_call'; name: string; params: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'extension_ui_request'; id: string; kind: string; message: string; options?: unknown }
  | { type: 'extension_ui_notify'; message: string }
  | { type: 'bridge_error'; error: string }
  | { type: 'sessions_list'; sessions: Array<{ path: string; name?: string; timestamp: string; firstMessage?: string }> }
  | { type: 'session_history'; messages: Array<SessionHistoryMessage>; cwd?: string };

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
    case 'list_sessions':
      return typeof value.cwd === 'string';
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
