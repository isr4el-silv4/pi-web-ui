import { createDebuggerClient } from './debugger-client.js';
import { createConsoleCapture } from './console-capture.js';
import { createNetworkCapture } from './network-capture.js';
import { attachDebuggerEventCapture } from './debugger-events.js';
import { createCookiesClient } from './cookies-client.js';
import { createStorageClient } from './storage-client.js';

export function createToolExecutor(chromeApi = chrome, captures = {}) {
  const debuggerClient = createDebuggerClient(chromeApi);
  const consoleCapture = captures.consoleCapture ?? createConsoleCapture();
  const networkCapture = captures.networkCapture ?? createNetworkCapture();
  if (!captures.skipAttachEvents && chromeApi.debugger?.onEvent) attachDebuggerEventCapture(chromeApi, { consoleCapture, networkCapture });
  const cookiesClient = captures.cookiesClient ?? createCookiesClient(chromeApi);
  const storageClient = captures.storageClient ?? createStorageClient(chromeApi);

  // Auto-start network capture
  networkCapture.start();

  const attachedTabs = new Set();
  const reattachTimers = new Map();  // tabId -> intervalId

  async function attachAndNotify(tabId) {
    await debuggerClient.attach(tabId);
    await debuggerClient.sendCdpCommand(tabId, 'Network.enable', {});
    await debuggerClient.sendCdpCommand(tabId, 'Runtime.enable', {});
    attachedTabs.add(tabId);

    // Notify sidepanel
    try {
      const tab = await chromeApi.tabs.get(tabId);
      captures.onAttach?.(tabId, tab.title);
    } catch {
      // Tab may have been closed
    }
  }

  async function detachTab(tabId) {
    // Clear any reattach timer for this tab
    const timerId = reattachTimers.get(tabId);
    if (timerId) {
      clearInterval(timerId);
      reattachTimers.delete(tabId);
    }

    if (attachedTabs.has(tabId)) {
      await debuggerClient.detach(tabId);
      attachedTabs.delete(tabId);
    }
  }

  function startReattachRetry(tabId) {
    const intervalId = setInterval(async () => {
      try {
        await attachAndNotify(tabId);
        clearInterval(intervalId);
        reattachTimers.delete(tabId);
        captures.onReattach?.(tabId);
      } catch {
        // DevTools still open or tab closed, keep retrying
      }
    }, 1000);
    reattachTimers.set(tabId, intervalId);
  }

  // Register detach listener for auto-reattach
  if (chromeApi.debugger?.onDetach) {
    chromeApi.debugger.onDetach.addListener((source, reason) => {
      attachedTabs.delete(source.tabId);
      captures.onDetach?.(source.tabId, reason);
      startReattachRetry(source.tabId);
    });
  }

  // Register tab activation listener for auto-attach
  if (chromeApi.tabs?.onActivated) {
    chromeApi.tabs.onActivated.addListener(async (activeInfo) => {
      const tabId = activeInfo.tabId;
      if (!attachedTabs.has(tabId) && !reattachTimers.has(tabId)) {
        try {
          await attachAndNotify(tabId);
        } catch {
          // DevTools may be open on this tab
        }
      }
    });
  }

  // Auto-attach to the active tab on startup
  (async () => {
    try {
      const tab = await debuggerClient.getCurrentTab();
      await attachAndNotify(tab.id);
    } catch {
      // Tab may be a chrome:// page or DevTools may be open
    }
  })();

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
        case 'console.getLogs': return { logs: consoleCapture.getLogs(params) };
        case 'console.clearLogBuffer': consoleCapture.clear(); return { cleared: true };
        case 'network.startCapture': return networkCapture.start();
        case 'network.stopCapture': return networkCapture.stop();
        case 'network.getRequests': return { requests: networkCapture.getRequests() };
        case 'network.getRequest': return networkCapture.getRequest(params.requestId);
        case 'network.getResponseBody': return networkCapture.getResponseBody(params.requestId) ?? debuggerClient.sendCdpCommand(tabId, 'Network.getResponseBody', { requestId: params.requestId });
        case 'cookies.get': return cookiesClient.getCookies(params);
        case 'storage.getLocal': return storageClient.getLocalStorage(tabId);
        case 'storage.getSession': return storageClient.getSessionStorage(tabId);
        case 'debugger.evaluateScript':
          return debuggerClient.sendCdpCommand(tabId, 'Runtime.evaluate', { expression: params.expression, returnByValue: true });
        case 'debugger.sendCdpCommand':
          return debuggerClient.sendCdpCommand(tabId, params.method, params.params ?? {});
        case 'debugger.attach':
          await attachAndNotify(tabId);
          return { attached: true };
        case 'debugger.detach':
          await detachTab(tabId);
          return { detached: true };
        default:
          throw new Error(`Unsupported browser tool: ${tool}`);
      }
    },
    isAttached(tabId) { return attachedTabs.has(tabId); },
    get attachedTabIds() { return [...attachedTabs]; },
    networkCapture,
    detachTab,
  };
}
