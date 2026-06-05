export function createDebuggerClient(chromeApi = chrome) {
  return {
    async getCurrentTab() {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      return tab;
    },
    async sendCdpCommand(tabId, method, params = {}) {
      return chromeApi.debugger.sendCommand({ tabId }, method, params);
    },
    async attach(tabId) {
      return chromeApi.debugger.attach({ tabId }, '1.3');
    },
    async detach(tabId) {
      return chromeApi.debugger.detach({ tabId });
    },
  };
}
