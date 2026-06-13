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
}
