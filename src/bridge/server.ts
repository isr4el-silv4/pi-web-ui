import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isClientCommand, type ClientCommand, type JsonObject, type JsonValue } from '../protocol/index.js';
import { createBrowserClientRegistry, type BrowserClientRegistry } from './browser-client.js';
import { createBrowserToolExecutor } from './browser-tools.js';
import { createSessionRegistry } from './session-registry.js';
import { parseStartContext, type BridgeStartContext } from './start-context.js';
import { attachWebSocketServer } from './websocket-server.js';
import { createDefaultPiSdkAdapter, createSdkSessionHost, type SdkAdapter } from './sdk-session.js';

export function createBridgeApp(options: { context: BridgeStartContext; pid?: number; sdkHost?: { create(options: { cwd: string; sessionPath?: string }): Promise<unknown> }; ui?: { respond(response: { id: string; value: unknown }): boolean } }) {
  const clients = createBrowserClientRegistry();
  const sessions = createSessionRegistry();
  sessions.createSession(options.context);
  let sdkSession: unknown;
  let unsubscribeSdk: (() => void) | undefined;

  function setupSdkSubscription(session: unknown) {
    // Clean up previous subscription
    unsubscribeSdk?.();
    
    console.log('[Bridge] Setting up SDK subscription, session:', typeof session, session ? 'exists' : 'null');
    // Subscribe to SDK session events and relay them to clients
    if (session && typeof (session as any).subscribe === 'function') {
      console.log('[Bridge] SDK session has subscribe method, attaching listener');
      unsubscribeSdk = (session as any).subscribe((event: { type: string; text?: string; message?: { role?: string; content?: unknown }; toolName?: string; result?: unknown }) => {
        console.log('[Bridge] SDK event received:', event.type, event);
        // SDK emits: message_end (with message.role), tool_execution_start/update/end, etc.
        if (event.type === 'message_end' && event.message?.role === 'assistant') {
          // Extract text content from assistant message
          const content = event.message.content;
          const text = Array.isArray(content)
            ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
            : typeof content === 'string' ? content : JSON.stringify(content);
          console.log('[Bridge] Broadcasting assistant_message, text length:', text?.length ?? 0);
          if (text) {
            clients.broadcast({ type: 'assistant_message', text });
          } else {
            console.log('[Bridge] No text content in assistant message_end event');
          }
        } else if (event.type === 'tool_execution_start') {
          console.log('[Bridge] Broadcasting tool_call:', event.toolName);
          clients.broadcast({ type: 'tool_call', name: event.toolName ?? 'unknown', params: {} });
        } else if (event.type === 'tool_execution_end') {
          console.log('[Bridge] Broadcasting tool_result:', event.toolName);
          clients.broadcast({ type: 'tool_result', name: event.toolName ?? 'unknown', result: event.result as import('../protocol/index.js').JsonValue });
        }
      });
    } else {
      console.log('[Bridge] SDK session missing or has no subscribe method');
    }
  }

  // Create browser tool executor for SDK integration
  const transport = {
    requestBrowserTool: async (tool: string, params: JsonObject) => {
      const session = sessions.getCurrentSession() ?? { id: 'default', cwd: options.context.cwd, permissionMode: options.context.permissionMode, cookieAccessEnabled: options.context.cookieAccessEnabled, storageAccessEnabled: options.context.storageAccessEnabled };
      const executor = createBrowserToolExecutor(clients, session);
      return executor.execute(tool, params);
    },
  };

  // If no sdkHost provided, create one using the default Pi SDK adapter
  let sdkHost = options.sdkHost;
  if (!sdkHost) {
    console.log('[Bridge] Creating default Pi SDK adapter...');
    // Create SDK adapter asynchronously - it will be ready when first needed
    const sdkAdapterPromise = createDefaultPiSdkAdapter({ execute: transport.requestBrowserTool });
    sdkHost = {
      async create(createOptions) {
        console.log('[Bridge] Creating SDK session with options:', createOptions);
        const adapter = await sdkAdapterPromise;
        return adapter.createSession(createOptions);
      },
    };
  }

  let ready = sdkHost.create({ cwd: options.context.cwd, sessionPath: options.context.sessionPath }).then((session) => { 
    sdkSession = session; 
    console.log('[Bridge] SDK session created successfully, has prompt:', typeof (session as any)?.prompt);
    setupSdkSubscription(session);
  }).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Bridge] Failed to create SDK session:', error);
    clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
  });

  const app = {
    // Expose browser clients for WebSocket server to register connections
    get browserClients(): BrowserClientRegistry {
      return clients;
    },
    status() {
      return {
        running: true,
        pid: options.pid ?? process.pid,
        port: options.context.port,
        browserClients: clients.count(),
        session: sessions.getCurrentSession(),
        sdkSession,
      };
    },
    handleClientCommand(command: ClientCommand) {
      switch (command.type) {
        case 'new_session': {
          const session = sessions.createSession({ cwd: command.cwd });
          ready = sdkHost.create({ cwd: command.cwd }).then((created) => { 
            sdkSession = created;
            setupSdkSubscription(created);
          }).catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to create SDK session:', error);
            clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
          });
          return session;
        }
        case 'resume_session': {
          const session = sessions.resumeSession(command.sessionPath, { cwd: options.context.cwd });
          ready = sdkHost.create({ cwd: options.context.cwd, sessionPath: command.sessionPath }).then((created) => { 
            sdkSession = created;
            setupSdkSubscription(created);
          }).catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to create SDK session:', error);
            clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
          });
          return session;
        }
        case 'set_permission_mode':
          return sessions.setPermissionMode(command.mode);
        case 'set_cookie_access':
          return sessions.setCookieAccess(command.enabled);
        case 'set_storage_access':
          return sessions.setStorageAccess(command.enabled);
        case 'prompt':
          console.log('[Bridge] Prompt received, sdkSession exists:', !!sdkSession, 'has prompt method:', typeof (sdkSession as any)?.prompt);
          // Queue prompt if SDK session isn't ready yet — retry once it becomes available
          if (!sdkSession) {
            console.log('[Bridge] SDK not ready, queuing prompt');
            ready.then(() => {
              console.log('[Bridge] SDK ready after queue, sdkSession exists:', !!sdkSession);
              if (sdkSession && typeof (sdkSession as any).prompt === 'function') {
                console.log('[Bridge] Forwarding queued prompt to SDK');
                (sdkSession as any).prompt(command.message).then(() => {
                  console.log('[Bridge] SDK prompt resolved, broadcasting prompt_sent');
                  clients.broadcast({ type: 'prompt_sent', message: command.message });
                }).catch((error: unknown) => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  console.error('[Bridge] Failed to send prompt to Pi:', error);
                  clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMessage });
                });
              } else {
                const errorMsg = 'SDK session initialization failed — prompt not forwarded to model';
                console.error('[Bridge]', errorMsg);
                clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMsg });
              }
            });
          } else if (typeof (sdkSession as any).prompt === 'function') {
            console.log('[Bridge] Sending prompt to SDK immediately');
            (sdkSession as any).prompt(command.message).then(() => {
              console.log('[Bridge] SDK prompt resolved, broadcasting prompt_sent');
              clients.broadcast({ type: 'prompt_sent', message: command.message });
            }).catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('[Bridge] Failed to send prompt to Pi:', error);
              clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMessage });
            });
          } else {
            console.error('[Bridge] SDK session exists but has no prompt method');
            clients.broadcast({ type: 'prompt_error', message: command.message, error: 'SDK session has no prompt method' });
          }
          // Also broadcast to clients for immediate UI feedback
          console.log('[Bridge] Broadcasting prompt_received');
          clients.broadcast({ type: 'prompt_received', message: command.message });
          return sessions.getCurrentSession();
        case 'abort':
          clients.broadcast({ type: 'abort_received' });
          return sessions.getCurrentSession();
        case 'extension_ui_response':
          return { handled: options.ui?.respond({ id: command.id, value: command.value }) ?? false };
      }
    },
    async executeBrowserTool(tool: string, params: JsonObject): Promise<JsonValue | undefined> {
      return transport.requestBrowserTool(tool, params);
    },
    get ready() {
      return ready;
    },
  };
  return app;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export function createHttpServer(context: BridgeStartContext) {
  const app = createBridgeApp({ context });
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/status') return sendJson(response, 200, app.status());
    if (request.method === 'GET' && request.url === '/open') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('Pi Web UI bridge is running. Open the Chrome extension side panel to continue.');
      return;
    }
    if (request.method === 'POST' && request.url === '/stop') {
      sendJson(response, 200, { stopped: true });
      server.close(() => process.exit(0));
      return;
    }
    if (request.method === 'POST' && request.url === '/command') {
      const parsed = JSON.parse(await readBody(request)) as unknown;
      if (!isClientCommand(parsed)) return sendJson(response, 400, { error: 'Invalid client command' });
      return sendJson(response, 200, app.handleClientCommand(parsed));
    }
    if (request.method === 'POST' && request.url === '/browser-tool') {
      const { tool, params } = JSON.parse(await readBody(request)) as { tool?: string; params?: JsonObject };
      if (!tool) return sendJson(response, 400, { error: 'Missing tool name' });
      try {
        const result = await app.executeBrowserTool(tool, params ?? {});
        return sendJson(response, 200, result);
      } catch (error) {
        return sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    }
    return sendJson(response, 404, { error: 'Not found' });
  });
  attachWebSocketServer(server, app);
  // Expose app for callers that need to wait for SDK readiness
  (server as any)._app = app;
  return server;
}

export async function main() {
  const context = parseStartContext(process.env.PI_WEB_UI_START_CONTEXT);
  const server = createHttpServer(context);
  // Wait for SDK session to be ready before accepting connections
  const app = (server as any)._app as ReturnType<typeof createBridgeApp>;
  await app.ready;
  server.listen(context.port, '127.0.0.1');
}

if (process.argv[1]?.endsWith('/bridge/server.js')) {
  void main();
}
