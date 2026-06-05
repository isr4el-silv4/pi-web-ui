export interface SdkAdapter {
  createSession(options: { cwd: string; sessionPath?: string }): Promise<unknown>;
}

export function createSdkSessionHost(adapter: SdkAdapter) {
  return {
    create(options: { cwd: string; sessionPath?: string }) {
      return adapter.createSession(options);
    },
  };
}
