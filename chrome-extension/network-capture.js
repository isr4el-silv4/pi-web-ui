export function createNetworkCapture(limit = 1000) {
  let enabled = false;
  const requests = new Map();
  const bodies = new Map();
  return {
    start() { enabled = true; return { capturing: true }; },
    stop() { enabled = false; return { capturing: false }; },
    recordRequest(request) {
      if (!enabled) return;
      requests.set(request.requestId, { ...request, timestamp: request.timestamp ?? Date.now() });
      while (requests.size > limit) requests.delete(requests.keys().next().value);
    },
    recordResponseBody(requestId, body) { if (enabled) bodies.set(requestId, body); },
    getRequests() { return [...requests.values()]; },
    getRequest(requestId) { return requests.get(requestId); },
    getResponseBody(requestId) { return bodies.has(requestId) ? { body: bodies.get(requestId) } : undefined; },
  };
}
