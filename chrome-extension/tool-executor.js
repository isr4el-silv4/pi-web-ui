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
    console.log(`[ToolExecutor] Attaching debugger to tab ${tabId}`);
    try {
      await debuggerClient.attach(tabId);
    } catch (error) {
      const msg = error.message ?? '';
      // If attach fails because a debugger is already attached (e.g., from a previous extension instance),
      // discover it via getTargets() and register it.
      if (msg.includes('already') || msg.includes('attached')) {
        console.log(`[ToolExecutor] Attach failed — debugger may already be attached to tab ${tabId}`);
        try {
          const targets = await chromeApi.debugger.getTargets();
          const existing = targets.find((t) => t.tabId === tabId);
          if (existing) {
            const tab = await chromeApi.tabs.get(tabId);
            console.log(`[ToolExecutor] Found existing debugger on tab ${tabId}: "${tab.title}"`);
            attachedTabs.add(tabId);
            captures.onAttach?.(tabId, tab.title);
            return;
          }
        } catch {
          // getTargets failed
        }
        // Re-throw if we couldn't find an existing debugger
        throw error;
      }
      throw error;
    }

    await debuggerClient.sendCdpCommand(tabId, 'Network.enable', {});
    await debuggerClient.sendCdpCommand(tabId, 'Runtime.enable', {});
    attachedTabs.add(tabId);

    // Notify sidepanel
    try {
      const tab = await chromeApi.tabs.get(tabId);
      console.log(`[ToolExecutor] Debugger attached to tab ${tabId}: "${tab.title}"`);
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
        console.log(`[ToolExecutor] Reattach retry for tab ${tabId}`);
        await attachAndNotify(tabId);
        clearInterval(intervalId);
        reattachTimers.delete(tabId);
        console.log(`[ToolExecutor] Reattach succeeded for tab ${tabId}`);
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
      console.log(`[ToolExecutor] Debugger detached from tab ${source.tabId}: ${reason}`);
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
        console.log(`[ToolExecutor] Tab activated — auto-attaching to tab ${tabId}`);
        try {
          await attachAndNotify(tabId);
        } catch {
          console.warn(`[ToolExecutor] Auto-attach failed for activated tab ${tabId}`);
          captures.onAttachFailed?.(tabId);
        }
      }
    });
  }

  // Auto-attach to the active tab on startup
  (async () => {
    try {
      console.log('[ToolExecutor] Auto-attaching debugger to active tab on startup');
      const tab = await debuggerClient.getCurrentTab();
      await attachAndNotify(tab.id);
    } catch (error) {
      console.warn(`[ToolExecutor] Auto-attach failed on startup: ${error.message ?? error}`);
    }
  })();

  async function currentTabId() {
    const tab = await debuggerClient.getCurrentTab();
    return tab.id;
  }

  return {
    async execute(tool, params = {}) {
      // Tools that don't require a target tab
      if (tool === 'debugger.getAttachedTabs') {
        const tabs = await Promise.all(
          [...attachedTabs].map(async (id) => {
            try {
              const tab = await chromeApi.tabs.get(id);
              return { id, title: tab.title };
            } catch {
              return { id, title: 'Unknown' };
            }
          }),
        );
        return { attachedTabs: tabs };
      }
      if (tool === 'tabs.getCurrent') {
        const tab = await debuggerClient.getCurrentTab();
        return { ...tab, debuggerAttached: attachedTabs.has(tab.id) };
      }
      if (tool === 'tabs.list') return { tabs: await chromeApi.tabs.query({}) };
      if (tool === 'console.clearLogBuffer') { consoleCapture.clear(); return { cleared: true }; }
      if (tool === 'network.startCapture') {
        networkCapture.start();
        // Send Network.enable to all attached tabs so CDP actually emits network events
        await Promise.all([...attachedTabs].map(async (id) => {
          try { await debuggerClient.sendCdpCommand(id, 'Network.enable', {}); } catch { /* ignore */ }
        }));
        return { capturing: true };
      }
      if (tool === 'network.stopCapture') {
        networkCapture.stop();
        // Send Network.disable to all attached tabs
        await Promise.all([...attachedTabs].map(async (id) => {
          try { await debuggerClient.sendCdpCommand(id, 'Network.disable', {}); } catch { /* ignore */ }
        }));
        return { capturing: false };
      }
      if (tool === 'network.getRequests') return { requests: networkCapture.getRequests() };
      if (tool === 'network.getRequest') return networkCapture.getRequest(params.requestId);
      if (tool === 'cookies.get') return cookiesClient.getCookies(params);
      if (tool === 'console.getLogs') {
        // Ensure Runtime domain is enabled on the target tab so console events are captured
        try {
          const consoleTabId = params.tabId === 'active' || !params.tabId ? await currentTabId() : params.tabId;
          if (attachedTabs.has(consoleTabId)) {
            try { await debuggerClient.sendCdpCommand(consoleTabId, 'Runtime.enable', {}); } catch { /* ignore */ }
          }
        } catch {
          // No active tab available — still return buffered logs
        }
        return { logs: consoleCapture.getLogs(params) };
      }

      const tabId = params.tabId === 'active' || !params.tabId ? await currentTabId() : params.tabId;
      switch (tool) {
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
        case 'storage.getLocal': return storageClient.getLocalStorage(tabId);
        case 'storage.getSession': return storageClient.getSessionStorage(tabId);
        case 'debugger.evaluateScript':
          if (!attachedTabs.has(tabId)) await attachAndNotify(tabId);
          return debuggerClient.sendCdpCommand(tabId, 'Runtime.evaluate', { expression: params.expression, returnByValue: true });
        case 'debugger.sendCdpCommand':
          if (!attachedTabs.has(tabId)) await attachAndNotify(tabId);
          return debuggerClient.sendCdpCommand(tabId, params.method, params.params ?? {});
        case 'network.getResponseBody':
          if (!attachedTabs.has(tabId)) {
            try { await attachAndNotify(tabId); } catch { /* may fail if DevTools open */ }
          }
          return networkCapture.getResponseBody(params.requestId) ?? debuggerClient.sendCdpCommand(tabId, 'Network.getResponseBody', { requestId: params.requestId });
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
