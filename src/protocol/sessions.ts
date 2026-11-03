export interface SessionStartOptions {
  cwd: string;
  sessionPath?: string;
  cookieAccessEnabled: boolean;
  storageAccessEnabled: boolean;
}

export interface SessionState {
  id: string;
  cwd: string;
  sessionPath?: string;
  cookieAccessEnabled: boolean;
  storageAccessEnabled: boolean;
  /** Run page scripts (`debugger.evaluateScript`, CDP `Runtime.evaluate`) without the per-request prompt. Off for every new session. */
  autoApproveScriptsEnabled?: boolean;
}
