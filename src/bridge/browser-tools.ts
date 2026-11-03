import type { BrowserToolName, JsonObject, JsonValue, SessionState } from '../protocol/index.js';
import type { BrowserToolRequestOptions } from './browser-client.js';
import { evaluateBrowserToolPermission } from './permissions.js';

export interface BrowserToolTransport {
  requestBrowserTool(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
  confirm?(message: string, options?: BrowserToolRequestOptions): Promise<boolean>;
  input?(message: string): Promise<string>;
  notify?(message: string): void;
  audit?: { record(entry: { action: string; params?: unknown }): void };
}

export interface BrowserToolPolicy {
  /** Exact origins whose tabs may run `Runtime.evaluate` without the per-request prompt. Empty = always prompt. */
  autoApproveEvaluateOrigins?: ReadonlySet<string>;
}

/** Parses a comma-separated list of exact http(s) origins; paths, wildcards and other schemes are ignored. */
export function parseAutoApproveEvaluateOrigins(value: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const raw of (value ?? '').split(',')) {
    const entry = raw.trim().replace(/\/$/, '');
    if (!entry) continue;
    try {
      const url = new URL(entry);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === entry && !url.hostname.includes('*')) origins.add(url.origin);
    } catch {
      // Not a URL: ignored, so a typo never widens the allowlist.
    }
  }
  return origins;
}

function request(transport: BrowserToolTransport, tool: BrowserToolName, params: JsonObject, options: BrowserToolRequestOptions) {
  return options.signal ? transport.requestBrowserTool(tool, params, options) : transport.requestBrowserTool(tool, params);
}

/** Tab of a `Runtime.evaluate` call the policy could approve. Synchronous, so that otherwise the prompt is raised without any extra await. */
function autoApprovableEvaluateTab(policy: BrowserToolPolicy, tool: BrowserToolName, params: JsonObject): number | undefined {
  if (!policy.autoApproveEvaluateOrigins?.size || tool !== 'debugger.sendCdpCommand' || params.method !== 'Runtime.evaluate') return undefined;
  return typeof params.tabId === 'number' && Number.isInteger(params.tabId) ? params.tabId : undefined;
}

async function tabIsOnTrustedOrigin(transport: BrowserToolTransport, policy: BrowserToolPolicy, tabId: number, options: BrowserToolRequestOptions) {
  try {
    const listed = (await request(transport, 'tabs.list', {}, options)) as { tabs?: Array<{ id?: unknown; url?: unknown }> } | undefined;
    options.signal?.throwIfAborted();
    const tab = listed?.tabs?.find((candidate) => candidate.id === tabId);
    return typeof tab?.url === 'string' && policy.autoApproveEvaluateOrigins?.has(new URL(tab.url).origin) === true;
  } catch {
    options.signal?.throwIfAborted();
    return false;
  }
}

export function createBrowserToolExecutor(transport: BrowserToolTransport, session: SessionState, policy: BrowserToolPolicy = {}) {
  return {
    async execute(tool: BrowserToolName, params: JsonObject, options: BrowserToolRequestOptions = {}) {
      options.signal?.throwIfAborted();
      const decision = evaluateBrowserToolPermission(session, tool, params);
      if (!decision.allowed) {
        if (!decision.requiresConfirmation) throw new Error(decision.reason);
        const tabId = autoApprovableEvaluateTab(policy, tool, params);
        if (tabId !== undefined && await tabIsOnTrustedOrigin(transport, policy, tabId, options)) {
          transport.audit?.record({ action: tool, params: { ...params, autoApproved: true } });
        } else {
          const message = `Allow browser tool ${tool}? ${decision.reason}`;
          const confirmed = options.signal
            ? await transport.confirm?.(message, options)
            : await transport.confirm?.(message);
          options.signal?.throwIfAborted();
          if (confirmed !== true) throw new Error(decision.reason);
          transport.audit?.record({ action: tool, params });
        }
      }
      options.signal?.throwIfAborted();
      return request(transport, tool, params, options);
    },
  };
}
