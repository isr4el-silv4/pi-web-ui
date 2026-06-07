import type { JsonObject } from '../protocol/index.js';

export interface SdkAdapter {
  createSession(options: { cwd: string; sessionPath?: string }): Promise<unknown>;
}

export interface BrowserToolExecutorLike {
  execute(tool: string, params: JsonObject): Promise<unknown>;
}

interface PiSdkModuleLike {
  DefaultResourceLoader: new (options: { cwd: string; agentDir?: string }) => unknown;
  createAgentSession: (options: Record<string, unknown>) => Promise<unknown> | unknown;
  defineTool: (definition: Record<string, unknown>) => unknown;
  discoverAndLoadExtensions?: (...args: unknown[]) => Promise<unknown> | unknown;
  loadSkills?: (...args: unknown[]) => Promise<unknown> | unknown;
  getAgentDir?: () => string;
  initTheme?: (...args: unknown[]) => void;
}

const browserToolMap: Record<string, string> = {
  browser_list_tabs: 'tabs.list',
  browser_get_current_tab: 'tabs.getCurrent',
  browser_get_page_html: 'page.getHtml',
  browser_get_page_text: 'page.getText',
  browser_get_selection: 'page.getSelection',
  browser_capture_screenshot: 'page.captureScreenshot',
  browser_get_console_logs: 'console.getLogs',
  browser_clear_console_log_buffer: 'console.clearLogBuffer',
  browser_start_network_capture: 'network.startCapture',
  browser_stop_network_capture: 'network.stopCapture',
  browser_get_network_requests: 'network.getRequests',
  browser_get_network_request: 'network.getRequest',
  browser_get_network_response_body: 'network.getResponseBody',
  browser_attach_debugger: 'debugger.attach',
  browser_detach_debugger: 'debugger.detach',
  browser_send_cdp_command: 'debugger.sendCdpCommand',
  browser_evaluate_script: 'debugger.evaluateScript',
  browser_get_cookies: 'cookies.get',
  browser_get_local_storage: 'storage.getLocal',
  browser_get_session_storage: 'storage.getSession',
};

export function createSdkSessionHost(adapter: SdkAdapter) {
  return {
    create(options: { cwd: string; sessionPath?: string }) {
      return adapter.createSession(options);
    },
  };
}

export function createBrowserToolDefinitions(sdk: Pick<PiSdkModuleLike, 'defineTool'>, executor: BrowserToolExecutorLike) {
  return Object.entries(browserToolMap).map(([name, bridgeTool]) => sdk.defineTool({
    name,
    description: `Execute browser tool ${bridgeTool} through the Pi Web UI Chrome bridge.`,
    parameters: { type: 'object', additionalProperties: true },
    execute: (params: JsonObject = {}) => executor.execute(bridgeTool, params),
  }));
}

export function createPiSdkAdapter({ sdk, browserToolExecutor }: { sdk: PiSdkModuleLike; browserToolExecutor: BrowserToolExecutorLike }): SdkAdapter {
  return {
    async createSession(options) {
      const agentDir = typeof sdk.getAgentDir === 'function' ? sdk.getAgentDir() : undefined;
      const resourceLoader = new sdk.DefaultResourceLoader({ cwd: options.cwd, agentDir });
      const extensions = sdk.discoverAndLoadExtensions
        ? await sdk.discoverAndLoadExtensions([], options.cwd, agentDir)
        : [];
      const skills = sdk.loadSkills
        ? await sdk.loadSkills({ cwd: options.cwd, agentDir, skillPaths: [] })
        : [];
      // Initialize the global theme system before creating the agent session
      if (typeof sdk.initTheme === 'function') {
        sdk.initTheme();
      }
      const tools = createBrowserToolDefinitions(sdk, browserToolExecutor);
      const result = await sdk.createAgentSession({
        cwd: options.cwd,
        sessionPath: options.sessionPath,
        resourceLoader,
        customTools: tools,
      });
      // Pi SDK returns { session } — extract the actual session object
      const session = result && typeof result === 'object' && 'session' in result ? (result as any).session : result;
      console.log('[Bridge] SDK createAgentSession returned, session has prompt:', typeof session?.prompt);
      return session;
    },
  };
}

export async function createDefaultPiSdkAdapter(browserToolExecutor: BrowserToolExecutorLike): Promise<SdkAdapter> {
  const sdk = await import('@earendil-works/pi-coding-agent') as unknown as PiSdkModuleLike;
  return createPiSdkAdapter({ sdk, browserToolExecutor });
}
