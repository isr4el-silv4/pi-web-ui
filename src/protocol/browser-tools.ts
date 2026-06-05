export type BrowserToolName =
  | 'tabs.list'
  | 'tabs.getCurrent'
  | 'tabs.select'
  | 'page.getHtml'
  | 'page.getText'
  | 'page.getSelection'
  | 'page.captureScreenshot'
  | 'console.getLogs'
  | 'console.clearLogBuffer'
  | 'network.startCapture'
  | 'network.stopCapture'
  | 'network.getRequests'
  | 'network.getRequest'
  | 'network.getResponseBody'
  | 'debugger.attach'
  | 'debugger.detach'
  | 'debugger.sendCdpCommand'
  | 'debugger.evaluateScript'
  | 'cookies.get'
  | 'storage.getLocal'
  | 'storage.getSession'
  | (string & {});

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface BrowserToolRequest {
  id: string;
  type: 'browser_tool_request';
  tool: BrowserToolName;
  params: JsonObject;
}

export interface BrowserToolResponse {
  id: string;
  type: 'browser_tool_response';
  success: boolean;
  data?: JsonValue;
  error?: string;
}

export function createBrowserToolRequest(
  id: string,
  tool: BrowserToolName,
  params: JsonObject = {},
): BrowserToolRequest {
  return { id, type: 'browser_tool_request', tool, params };
}

export function createBrowserToolResponse(
  id: string,
  success: boolean,
  data?: JsonValue,
  error?: string,
): BrowserToolResponse {
  return { id, type: 'browser_tool_response', success, ...(data === undefined ? {} : { data }), ...(error === undefined ? {} : { error }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBrowserToolRequest(value: unknown): value is BrowserToolRequest {
  return (
    isRecord(value) &&
    value.type === 'browser_tool_request' &&
    typeof value.id === 'string' &&
    typeof value.tool === 'string' &&
    isRecord(value.params)
  );
}

export function isBrowserToolResponse(value: unknown): value is BrowserToolResponse {
  return (
    isRecord(value) &&
    value.type === 'browser_tool_response' &&
    typeof value.id === 'string' &&
    typeof value.success === 'boolean' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}
