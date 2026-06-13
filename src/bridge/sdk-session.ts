import type { JsonObject } from '../protocol/index.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Resolves a CWD path, ensuring it exists on disk.
 * 
 * Strategy:
 * 1. If absolute path exists, return it as-is
 * 2. If relative, resolve against process.cwd() and check if it exists
 * 3. If the resolved path doesn't exist, search for a directory with that name
 *    in common locations: home dir, home subdirs (Desktop, Documents, Downloads, Projects, etc.),
 *    and parent of process.cwd()
 * 4. Return the best match found, or the original resolved path as fallback
 */
const COMMON_HOME_SUBDIRS = [
  '',                          // home dir itself
  'Desktop',
  'Documents',
  'Downloads',
  'Projects',
  'IdeaProjects',
  'src',
  'code',
  'workspace',
];

export function resolveCwd(cwd: string, homeDir: string = os.homedir()): string {
  const resolved = path.resolve(cwd);
  
  // If the resolved path exists, use it directly
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return resolved;
  }
  
  // If the path is already absolute but doesn't exist, return it as-is
  // (the caller will handle the error)
  if (path.isAbsolute(cwd)) {
    return resolved;
  }
  
  // For relative paths that don't exist in process.cwd(), search common locations
  const dirName = path.basename(cwd);
  const searchDirs = [
    ...COMMON_HOME_SUBDIRS.map((sub) => path.join(homeDir, sub)),
    path.dirname(process.cwd()),  // parent of process.cwd()
  ];
  
  for (const searchDir of searchDirs) {
    const candidate = path.join(searchDir, dirName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      console.log(`[Bridge] CWD '${cwd}' not found at '${resolved}', found at: '${candidate}'`);
      return candidate;
    }
  }
  
  // Return the original resolved path (may not exist, but caller decides)
  return resolved;
}

export interface SdkAdapter {
  createSession(options: { cwd: string; sessionPath?: string }): Promise<unknown>;
}

export interface BrowserToolExecutorLike {
  execute(tool: string, params: JsonObject): Promise<unknown>;
}

interface PiSdkModuleLike {
  DefaultResourceLoader: new (options: { cwd: string; agentDir?: string }) => unknown;
  SessionManager?: {
    open(path: string, sessionDir?: string, cwdOverride?: string): unknown;
  };
  createAgentSession: (options: Record<string, unknown>) => Promise<unknown> | unknown;
  defineTool: (definition: Record<string, unknown>) => unknown;
  discoverAndLoadExtensions?: (...args: unknown[]) => Promise<unknown> | unknown;
  loadSkills?: (...args: unknown[]) => Promise<unknown> | unknown;
  getAgentDir?: () => string;
  initTheme?: (...args: unknown[]) => void;
}

const browserToolDescriptions: Record<string, { tool: string; description: string }> = {
  browser_list_tabs: { tool: 'tabs.list', description: 'List all open browser tabs.' },
  browser_get_current_tab: { tool: 'tabs.getCurrent', description: 'Get the currently active browser tab. Returns a debuggerAttached boolean indicating whether the Chrome debugger is attached to this tab. If debuggerAttached is false, use browser_attach_debugger to attach to this tab first, or use browser_get_attached_tabs to see which tabs are being debugged.' },
  browser_get_page_html: { tool: 'page.getHtml', description: 'Get the full HTML of the current page.' },
  browser_get_page_text: { tool: 'page.getText', description: 'Get the visible text content of the current page.' },
  browser_get_selection: { tool: 'page.getSelection', description: 'Get the currently selected text on the page.' },
  browser_capture_screenshot: { tool: 'page.captureScreenshot', description: 'Capture a screenshot of the current tab.' },
  browser_get_console_logs: {
    tool: 'console.getLogs',
    description: 'Get console logs from the browser. Console capture is automatically enabled when the debugger attaches — do NOT call browser_start_network_capture first, just call this directly.',
  },
  browser_clear_console_log_buffer: { tool: 'console.clearLogBuffer', description: 'Clear the buffered console logs.' },
  browser_start_network_capture: {
    tool: 'network.startCapture',
    description: 'Start network request capture. Network capture is automatically enabled when the debugger attaches — you typically do NOT need to call this. Only call it if you previously stopped capture with browser_stop_network_capture and want to resume.',
  },
  browser_stop_network_capture: {
    tool: 'network.stopCapture',
    description: 'Stop network request capture. Use sparingly — capture is auto-enabled on debugger attach.',
  },
  browser_get_network_requests: {
    tool: 'network.getRequests',
    description: 'Get all captured network requests. Network capture is automatically enabled when the debugger attaches — do NOT call browser_start_network_capture first, just call this directly to get the requests.',
  },
  browser_get_network_request: { tool: 'network.getRequest', description: 'Get details for a specific network request by requestId.' },
  browser_get_network_response_body: { tool: 'network.getResponseBody', description: 'Get the response body for a specific network request by requestId.' },
  browser_attach_debugger: { tool: 'debugger.attach', description: 'Attach the Chrome debugger to a tab. Automatically enables network and console capture.' },
  browser_detach_debugger: { tool: 'debugger.detach', description: 'Detach the Chrome debugger from a tab.' },
  browser_get_attached_tabs: { tool: 'debugger.getAttachedTabs', description: 'Get all tabs that currently have the debugger attached.' },
  browser_send_cdp_command: { tool: 'debugger.sendCdpCommand', description: 'Send a raw Chrome DevTools Protocol command to the debugger.' },
  browser_evaluate_script: { tool: 'debugger.evaluateScript', description: 'Evaluate JavaScript in the context of the current page.' },
  browser_get_cookies: { tool: 'cookies.get', description: 'Get cookies for the current page or a specific domain.' },
  browser_get_local_storage: { tool: 'storage.getLocal', description: 'Get localStorage entries for the current page.' },
  browser_get_session_storage: { tool: 'storage.getSession', description: 'Get sessionStorage entries for the current page.' },
};

const browserToolMap: Record<string, string> = Object.fromEntries(
  Object.entries(browserToolDescriptions).map(([name, { tool }]) => [name, tool]),
);

export function createSdkSessionHost(adapter: SdkAdapter) {
  return {
    create(options: { cwd: string; sessionPath?: string }) {
      return adapter.createSession(options);
    },
  };
}

export function createBrowserToolDefinitions(sdk: Pick<PiSdkModuleLike, 'defineTool'>, executor: BrowserToolExecutorLike) {
  return Object.entries(browserToolDescriptions).map(([name, { tool: bridgeTool, description }]) => sdk.defineTool({
    name,
    description,
    parameters: { type: 'object', additionalProperties: true },
    execute: async (_toolCallId: string, params: JsonObject = {}) => {
      try {
        const result = await executor.execute(bridgeTool, params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  }));
}

export function createPiSdkAdapter({ sdk, browserToolExecutor }: { sdk: PiSdkModuleLike; browserToolExecutor: BrowserToolExecutorLike }): SdkAdapter {
  return {
    async createSession(options) {
      console.log('[Bridge] Creating SDK session with cwd:', options.cwd);
      
      // Resolve to absolute path, with home directory fallback for relative paths
      const resolvedCwd = resolveCwd(options.cwd);
      console.log('[Bridge] Resolved cwd:', resolvedCwd);
      
      const agentDir = typeof sdk.getAgentDir === 'function' ? sdk.getAgentDir() : undefined;
      console.log('[Bridge] agentDir:', agentDir);
      const resourceLoader = new sdk.DefaultResourceLoader({ cwd: resolvedCwd, agentDir });
      const extensions = sdk.discoverAndLoadExtensions
        ? await sdk.discoverAndLoadExtensions([], resolvedCwd, agentDir)
        : [];
      const skills = sdk.loadSkills
        ? await sdk.loadSkills({ cwd: resolvedCwd, agentDir, skillPaths: [] })
        : [];
      // Initialize the global theme system before creating the agent session
      if (typeof sdk.initTheme === 'function') {
        sdk.initTheme();
      }
      const tools = createBrowserToolDefinitions(sdk, browserToolExecutor);
      
      // When resuming a session, create a SessionManager that loads the existing session file.
      // The SDK's createAgentSession ignores `sessionPath` — it only accepts a pre-built `sessionManager`.
      let sessionManager: unknown = undefined;
      if (options.sessionPath && sdk.SessionManager) {
        console.log('[Bridge] Opening existing session from:', options.sessionPath);
        sessionManager = sdk.SessionManager.open(options.sessionPath);
        const context = (sessionManager as any).buildSessionContext();
        console.log('[Bridge] Loaded session context with', context.messages?.length ?? 0, 'messages');
      }
      
      const result = await sdk.createAgentSession({
        cwd: resolvedCwd,
        sessionManager,
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
