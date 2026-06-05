function collectLocalStorage() { return Object.fromEntries(Object.entries(localStorage)); }
function collectSessionStorage() { return Object.fromEntries(Object.entries(sessionStorage)); }

export function createStorageClient(chromeApi = chrome) {
  return {
    async getLocalStorage(tabId) {
      const [result] = await chromeApi.scripting.executeScript({ target: { tabId }, func: collectLocalStorage });
      return { storage: result.result };
    },
    async getSessionStorage(tabId) {
      const [result] = await chromeApi.scripting.executeScript({ target: { tabId }, func: collectSessionStorage });
      return { storage: result.result };
    },
  };
}
