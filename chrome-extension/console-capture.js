export function createConsoleCapture(limit = 500) {
  const logs = [];
  return {
    record(entry) {
      logs.push({ ...entry, timestamp: entry.timestamp ?? Date.now() });
      while (logs.length > limit) logs.shift();
    },
    getLogs({ levels, tabId } = {}) {
      return logs.filter((log) => (!levels || levels.includes(log.level)) && (!tabId || log.tabId === tabId));
    },
    clear() { logs.length = 0; },
  };
}
