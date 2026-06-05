export function attachDebuggerEventCapture(chromeApi = chrome, { consoleCapture, networkCapture }) {
  chromeApi.debugger.onEvent.addListener((source, method, params = {}) => {
    if (method === 'Runtime.consoleAPICalled') {
      consoleCapture.record({
        tabId: source.tabId,
        level: params.type ?? 'log',
        text: (params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' '),
        timestamp: Date.now(),
      });
    }
    if (method === 'Network.requestWillBeSent') {
      networkCapture.recordRequest({
        tabId: source.tabId,
        requestId: params.requestId,
        url: params.request?.url,
        method: params.request?.method,
        timestamp: Date.now(),
      });
    }
  });
}
