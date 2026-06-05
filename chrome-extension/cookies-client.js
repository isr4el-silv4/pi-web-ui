export function createCookiesClient(chromeApi = chrome) {
  return {
    async getCookies(params = {}) {
      return { cookies: await chromeApi.cookies.getAll(params) };
    },
  };
}
