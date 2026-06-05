import { createDebuggerClient } from './debugger-client.js';

export function createToolExecutor(chromeApi = chrome) {
  const debuggerClient = createDebuggerClient(chromeApi);

  async function currentTabId() {
    const tab = await debuggerClient.getCurrentTab();
    return tab.id;
  }

  return {
    async execute(tool, params = {}) {
      const tabId = params.tabId === 'active' || !params.tabId ? await currentTabId() : params.tabId;
      switch (tool) {
        case 'tabs.getCurrent':
          return debuggerClient.getCurrentTab();
        case 'tabs.list':
          return { tabs: await chromeApi.tabs.query({}) };
        case 'page.getText': {
          const [result] = await chromeApi.scripting.executeScript({ target: { tabId }, func: () => document.body?.innerText ?? '' });
          return { text: result.result };
        }
        case 'page.getHtml': {
          const [result] = await chromeApi.scripting.executeScript({ target: { tabId }, func: () => document.documentElement.outerHTML });
          return { html: result.result };
        }
        case 'page.getSelection': {
          const [result] = await chromeApi.scripting.executeScript({ target: { tabId }, func: () => String(globalThis.getSelection?.() ?? '') });
          return { selection: result.result };
        }
        case 'page.captureScreenshot':
          return { dataUrl: await (chromeApi.tabsCapture ? chromeApi.tabsCapture() : chromeApi.tabs.captureVisibleTab()) };
        case 'debugger.sendCdpCommand':
          return debuggerClient.sendCdpCommand(tabId, params.method, params.params ?? {});
        case 'debugger.attach':
          await debuggerClient.attach(tabId); return { attached: true };
        case 'debugger.detach':
          await debuggerClient.detach(tabId); return { detached: true };
        default:
          throw new Error(`Unsupported browser tool: ${tool}`);
      }
    },
  };
}
