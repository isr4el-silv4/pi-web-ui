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
      const result = await sdk.createAgentSession({
        cwd: resolvedCwd,
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
