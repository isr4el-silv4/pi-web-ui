import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import { isClientCommand, type ClientCommand, type JsonObject, type JsonValue, type SessionHistoryMessage, type CommandInfo, type SkillInfo, type TemplateInfo, type CompletionItem } from '../protocol/index.js';
import { createBrowserClientRegistry, type BrowserClientRegistry } from './browser-client.js';
import { createBrowserToolExecutor } from './browser-tools.js';
import { createSessionRegistry } from './session-registry.js';
import { parseStartContext, type BridgeStartContext } from './start-context.js';
import { attachWebSocketServer } from './websocket-server.js';
import { createDefaultPiSdkAdapter, createSdkSessionHost, resolveCwd, type SdkAdapter } from './sdk-session.js';
import { createExtensionUiAdapter, type UiResponse } from './extension-ui-adapter.js';
import { createWebUiContext } from './web-ui-context.js';

export function createBridgeApp(options: { context: BridgeStartContext; pid?: number; sdkHost?: { create(options: { cwd: string; sessionPath?: string }): Promise<unknown> }; ui?: { respond(response: UiResponse): boolean } }) {
  const clients = createBrowserClientRegistry();
  const uiAdapter = createExtensionUiAdapter({ broadcast: (msg) => clients.broadcast(msg as JsonObject) });
  const webUiContext = createWebUiContext({ broadcast: (msg) => clients.broadcast(msg) });
  const sessions = createSessionRegistry();
  sessions.createSession(options.context);
  let sdkSession: unknown;
  let unsubscribeSdk: (() => void) | undefined;
  // Track whether the user requested an abort — suppress any message_end arriving after
  let aborted = false;

  function setupSdkSubscription(session: unknown) {
    // Clean up previous subscription
    unsubscribeSdk?.();
    
    console.log('[Bridge] Setting up SDK subscription, session:', typeof session, session ? 'exists' : 'null');
    // Subscribe to SDK session events and relay them to clients
    if (session && typeof (session as any).subscribe === 'function') {
      console.log('[Bridge] SDK session has subscribe method, attaching listener');
      unsubscribeSdk = (session as any).subscribe((event: { type: string; text?: string; message?: { role?: string; content?: unknown }; toolName?: string; result?: unknown }) => {
        try {
          console.log('[Bridge] SDK event received:', event.type, event);
          // SDK emits: message_end (with message.role), tool_execution_start/update/end, etc.
          if (event.type === 'message_end' && event.message?.role === 'assistant') {
            // Skip messages that arrive after the user clicked abort — the model may finish
            // generating before the abort signal reaches the provider, resulting in a
            // normal stopReason ("end_turn") instead of "aborted"
            if (aborted) {
              console.log('[Bridge] Suppressing assistant message_end — abort was requested');
            } else if ((event.message as any).stopReason === 'aborted') {
              console.log('[Bridge] Skipping aborted assistant message_end');
            } else {
              // Extract text content from assistant message
              const content = event.message.content;
              const text = Array.isArray(content)
                ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
                : typeof content === 'string' ? content : JSON.stringify(content);
              // Extract thinking block if present
              let thinking: string | undefined;
              if (Array.isArray(content)) {
                const thinkingBlock = content.find((c: any) => c?.type === 'thinking');
                if (thinkingBlock) {
                  thinking = thinkingBlock.thinking || thinkingBlock.text || '';
                }
              }
              console.log('[Bridge] Broadcasting assistant_message, text length:', text?.length ?? 0, 'thinking:', !!thinking);
              if (text || thinking) {
                const msg: { type: string; text: string; thinking?: string } = { type: 'assistant_message', text: text || '' };
                if (thinking) msg.thinking = thinking;
                clients.broadcast(msg);
              } else {
                console.log('[Bridge] No text or thinking content in assistant message_end event');
              }
            }
          } else if (event.type === 'tool_execution_start') {
            console.log('[Bridge] Broadcasting tool_call:', event.toolName);
            clients.broadcast({ type: 'tool_call', name: event.toolName ?? 'unknown', params: {} });
          } else if (event.type === 'tool_execution_end') {
            console.log('[Bridge] Broadcasting tool_result:', event.toolName);
            clients.broadcast({ type: 'tool_result', name: event.toolName ?? 'unknown', result: event.result as import('../protocol/index.js').JsonValue });
          }
        } catch (err) {
          console.error('[Bridge] SDK subscription callback error:', err);
          // Never let callback errors propagate — they would reject the SDK's prompt() call
        }
      });
    } else {
      console.log('[Bridge] SDK session missing or has no subscribe method');
    }
  }

  async function bindSessionExtensions(session: unknown) {
    if (!session || typeof (session as any).bindExtensions !== 'function') {
      console.log('[Bridge] Skipping bindExtensions — session missing or no bindExtensions method');
      return;
    }
    try {
      console.log('[Bridge] Calling bindExtensions on session');
      await (session as any).bindExtensions({
        uiContext: webUiContext,
        mode: 'rpc',
        commandContextActions: {
          waitForIdle: () => {
            if (sdkSession && typeof (sdkSession as any).agent?.waitForIdle === 'function') {
              return (sdkSession as any).agent.waitForIdle();
            }
            return Promise.resolve();
          },
          newSession: async (_options?: unknown) => {
            // Defer to bridge command handler
            return { cancelled: false };
          },
          switchSession: async (_sessionPath?: string, _options?: unknown) => {
            // Defer to bridge command handler
            return { cancelled: false };
          },
          fork: async (_entryId?: string, _options?: unknown) => {
            return { cancelled: true };
          },
          navigateTree: async (_targetId?: string, _options?: unknown) => {
            return { cancelled: true };
          },
          reload: async () => {
            if (sdkSession && typeof (sdkSession as any).reload === 'function') {
              await (sdkSession as any).reload();
            }
          },
        },
        onError: (err: any) => {
          console.error('[Bridge] Extension error:', err?.extensionPath, err?.error);
          clients.broadcast({ type: 'extension_ui_notify', message: `Extension error: ${err?.error || 'unknown'}` });
        },
      });
      console.log('[Bridge] bindExtensions completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Bridge] bindExtensions failed:', errorMessage);
    }
  }

  function listResources() {
    if (!sdkSession) return { commands: [], skills: [], templates: [] };
    const commands: CommandInfo[] = [];
    const skills: SkillInfo[] = [];
    const templates: TemplateInfo[] = [];

    try {
      const runner = (sdkSession as any).extensionRunner;
      if (runner?.getRegisteredCommands) {
        for (const cmd of runner.getRegisteredCommands()) {
          commands.push({
            name: cmd.invocationName || cmd.name,
            description: cmd.description || '',
            source: cmd.sourceInfo?.path || 'extension',
            hasCompletions: typeof cmd.getArgumentCompletions === 'function',
          });
        }
      }
    } catch (e) {
      console.warn('[Bridge] Failed to list extension commands:', e);
    }

    try {
      const loader = (sdkSession as any).resourceLoader;
      if (loader?.getSkills) {
        const skillList = loader.getSkills();
        for (const skill of skillList.skills || []) {
          skills.push({ name: skill.name, description: skill.description || '' });
        }
      }
    } catch (e) {
      console.warn('[Bridge] Failed to list skills:', e);
    }

    try {
      const promptTemplates = (sdkSession as any).promptTemplates;
      if (Array.isArray(promptTemplates)) {
        for (const tmpl of promptTemplates) {
          templates.push({
            name: tmpl.name,
            description: tmpl.description || '',
            args: tmpl.args || [],
          });
        }
      }
    } catch (e) {
      console.warn('[Bridge] Failed to list templates:', e);
    }

    return { commands, skills, templates };
  }

  async function getCompletions(commandName: string, argsPrefix: string): Promise<CompletionItem[]> {
    if (!sdkSession) return [];
    try {
      const runner = (sdkSession as any).extensionRunner;
      if (!runner?.getCommand) return [];
      const cmd = runner.getCommand(commandName);
      if (!cmd?.getArgumentCompletions) return [];
      const results = await cmd.getArgumentCompletions(argsPrefix);
      return (results || []).map((r: any) => ({
        value: r.value || r.label || String(r),
        label: r.label || r.value || String(r),
        description: r.description || '',
      }));
    } catch (e) {
      console.warn('[Bridge] Failed to get completions:', e);
      return [];
    }
  }

  // Create browser tool executor for SDK integration
  const transport = {
    requestBrowserTool: async (tool: string, params: JsonObject) => {
      const session = sessions.getCurrentSession() ?? { id: 'default', cwd: options.context.cwd, cookieAccessEnabled: options.context.cookieAccessEnabled, storageAccessEnabled: options.context.storageAccessEnabled };
      const executor = createBrowserToolExecutor({ ...clients, confirm: uiAdapter.confirm, input: uiAdapter.input, notify: uiAdapter.notify }, session);
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
    void bindSessionExtensions(session);
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
          aborted = false;
          const resolvedCwd = resolveCwd(command.cwd);
          const session = sessions.createSession({ cwd: resolvedCwd });
          // Clear chat history for the new session
          clients.broadcast({ type: 'session_history', messages: [], cwd: resolvedCwd });
          ready = sdkHost.create({ cwd: resolvedCwd }).then((created) => { 
            sdkSession = created;
            setupSdkSubscription(created);
            void bindSessionExtensions(created);
          }).catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to create SDK session:', error);
            clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
          });
          return session;
        }
        case 'resume_session': {
          aborted = false;
          // 1. Build and broadcast session history (async, fires in background)
          buildSessionHistory(command.sessionPath)
            .then(({ messages, cwd: sessionCwd }) => {
              const event: { type: string; messages: SessionHistoryMessage[]; cwd?: string } = 
                { type: 'session_history', messages };
              if (sessionCwd) event.cwd = sessionCwd;
              clients.broadcast(event as JsonObject);
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              clients.broadcast({ type: 'session_error', error: `Failed to load session history: ${errorMessage}` });
            });

          // 2. Extract cwd from session file header (synchronous)
          const sessionCwd = extractSessionCwdSync(command.sessionPath);
          const resolvedCwd = sessionCwd ?? options.context.cwd;
          console.log(`[Bridge] Resuming session from ${command.sessionPath}, cwd=${resolvedCwd}`);

          // 3. Create session in registry with the session's own cwd
          const session = sessions.resumeSession(command.sessionPath, { cwd: resolvedCwd });

          // 4. Create SDK session with the session's own cwd so it operates in the correct directory
          ready = sdkHost.create({ cwd: resolvedCwd, sessionPath: command.sessionPath }).then((created) => { 
            sdkSession = created;
            setupSdkSubscription(created);
            void bindSessionExtensions(created);
          }).catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to create SDK session:', error);
            clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
          });
          return session;
        }
        case 'list_sessions': {
          const resolvedCwd = resolveCwd(command.cwd);
          listSessionsForCwd(resolvedCwd)
            .then((sessionList) => {
              clients.broadcast({ type: 'sessions_list', sessions: sessionList });
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              clients.broadcast({ type: 'session_error', error: `Failed to list sessions: ${errorMessage}` });
            });
          // Return the full current session so session_state doesn't overwrite sessionPath
          return sessions.getCurrentSession();
        }
        case 'set_cookie_access':
          return sessions.setCookieAccess(command.enabled);
        case 'set_storage_access':
          return sessions.setStorageAccess(command.enabled);
        case 'prompt':
          // Reset abort flag so the new prompt's response is allowed through
          aborted = false;
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
          aborted = true;
          console.log('[Bridge] Abort received, sdkSession exists:', !!sdkSession);
          if (sdkSession) {
            const abortMethod = (sdkSession as any).abort;
            console.log('[Bridge] sdkSession.abort type:', typeof abortMethod, 'is function:', typeof abortMethod === 'function');
            console.log('[Bridge] sdkSession keys:', Object.keys(sdkSession));
            if (typeof abortMethod === 'function') {
              console.log('[Bridge] Calling sdkSession.abort() immediately');
              const abortPromise = (sdkSession as any).abort();
              console.log('[Bridge] sdkSession.abort() returned promise:', !!abortPromise);
              abortPromise.catch((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[Bridge] sdkSession.abort() failed:', errorMessage);
                clients.broadcast({ type: 'bridge_error', error: `Abort failed: ${errorMessage}` });
              });
            } else {
              console.log('[Bridge] Skipping sdkSession.abort() — no abort method on session');
              console.log('[Bridge] Available methods on sdkSession:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdkSession)));
            }
          } else {
            console.log('[Bridge] Skipping sdkSession.abort() — session not ready');
          }
          clients.broadcast({ type: 'abort_received' });
          return sessions.getCurrentSession();
        case 'extension_ui_response':
          const handledByUi = options.ui?.respond({ id: command.id, value: command.value });
          const handledByWeb = webUiContext.respond({ id: command.id, value: command.value });
          const handledByAdapter = uiAdapter.respond({ id: command.id, value: command.value });
          return { handled: handledByUi ?? handledByWeb ?? handledByAdapter };
        case 'list_resources': {
          const resources = listResources();
          clients.broadcast({ type: 'resources_list', ...resources } as unknown as JsonObject);
          return sessions.getCurrentSession();
        }
        case 'get_completions': {
          getCompletions(command.command, command.args)
            .then((items) => {
              clients.broadcast({ type: 'command_completions', items } as unknown as JsonObject);
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              clients.broadcast({ type: 'extension_command_error', command: command.command, error: errorMessage } as JsonObject);
            });
          return sessions.getCurrentSession();
        }
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

// ===== Session Resume Helpers =====

/**
 * Lists session files for a given working directory.
 * Returns session metadata sorted by timestamp (most recent first).
 * Uses listAll() + client-side filtering since SessionManager.list(cwd)
 * requires exact cwd match (path hash) which is fragile.
 */
async function listSessionsForCwd(cwd: string): Promise<Array<{ path: string; name?: string; timestamp: string; firstMessage?: string }>> {
  const { SessionManager } = await import('@earendil-works/pi-coding-agent');
  const allSessions = await SessionManager.listAll();
  
  // Normalize the target cwd for comparison
  const normalizedCwd = cwd.replace(/\/+$/, ''); // strip trailing slashes
  console.log(`[Bridge] listSessionsForCwd: cwd="${normalizedCwd}", total sessions found: ${allSessions.length}`);
  
  const results: Array<{ path: string; name?: string; timestamp: string; firstMessage?: string }> = [];
  
  for (const info of allSessions) {
    const sessionCwd = info.cwd.replace(/\/+$/, '');
    // Match by cwd — both absolute paths should match
    if (sessionCwd === normalizedCwd) {
      results.push({ 
        path: info.path, 
        name: info.name || undefined, 
        timestamp: info.modified.toISOString(),
        firstMessage: info.firstMessage || undefined,
      });
    }
  }
  
  console.log(`[Bridge] listSessionsForCwd: matched ${results.length} sessions for cwd="${normalizedCwd}"`);
  
  // Sort by timestamp descending (most recent first)
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return results;
}

/**
 * Extract the cwd from a session file header (synchronous).
 * Session files are JSONL - the first line is the session header with cwd.
 * Returns undefined if the file doesn't exist or has no valid header.
 */
function extractSessionCwdSync(sessionPath: string): string | undefined {
  try {
    if (!fs.existsSync(sessionPath)) return undefined;
    const fd = fs.openSync(sessionPath, 'r');
    try {
      const buffer = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n')[0].trim();
      if (!firstLine) return undefined;
      const header = JSON.parse(firstLine) as { type?: string; cwd?: string };
      if (header.type !== 'session') return undefined;
      return typeof header.cwd === 'string' && header.cwd ? header.cwd : undefined;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/**
 * Builds session history from a JSONL session file.
 * Returns an array of SessionHistoryMessage objects for UI display,
 * along with the cwd from the session header.
 */
async function buildSessionHistory(sessionPath: string): Promise<{ messages: SessionHistoryMessage[]; cwd?: string }> {
  const { SessionManager } = await import('@earendil-works/pi-coding-agent');
  
  const manager = SessionManager.open(sessionPath);
  const context = manager.buildSessionContext();
  const messages: SessionHistoryMessage[] = [];

  for (const entry of context.messages) {
    try {
      if (entry.role === 'user') {
        messages.push(mapUserAgentMessage(entry));
      } else if (entry.role === 'assistant') {
        messages.push(mapAssistantAgentMessage(entry));
      } else if (entry.role === 'toolResult') {
        messages.push(mapToolResultAgentMessage(entry));
      }
      // Other roles (system, etc.) are skipped for UI display
    } catch (error) {
      console.warn(`[Bridge] Failed to map message entry:`, error);
    }
  }
  
  // Extract cwd from session header via SessionManager
  const cwd = (manager as any).getCwd?.() as string | undefined;
  
  return { messages, cwd };
}

function extractAgentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c && typeof c === 'object' && c.type === 'text')
      .map((c: any) => c.text || '')
      .join('\n');
  }
  return JSON.stringify(content);
}

function mapUserAgentMessage(entry: any): SessionHistoryMessage {
  const content = entry.content || '';
  const text = typeof content === 'string' ? content : extractAgentText(content);
  
  // Check for image attachments
  if (Array.isArray(content)) {
    const imageBlock = content.find((c: any) => c?.type === 'image');
    if (imageBlock) {
      return {
        role: 'user',
        text,
        image: {
          data: imageBlock.data || imageBlock.url || '',
          mimeType: imageBlock.mimeType || imageBlock.contentType || 'image/png',
        },
      };
    }
  }
  
  return { role: 'user', text };
}

function mapAssistantAgentMessage(entry: any): SessionHistoryMessage {
  const content = entry.content || '';
  const text = typeof content === 'string' ? content : extractAgentText(content);
  
  // Extract thinking block if present
  let thinking: string | undefined;
  if (Array.isArray(content)) {
    const thinkingBlock = content.find((c: any) => c?.type === 'thinking');
    if (thinkingBlock) {
      thinking = thinkingBlock.thinking || thinkingBlock.text || '';
    }
  }
  
  return { role: 'assistant', text, thinking: thinking || undefined };
}

function mapToolResultAgentMessage(entry: any): SessionHistoryMessage {
  const content = entry.content || '';
  const text = typeof content === 'string' ? content : extractAgentText(content);
  
  // Try to extract tool name from content or entry metadata
  const toolName = (entry as any).toolName || (entry as any).name || 'tool';
  
  return {
    role: 'tool',
    toolName,
    toolResult: text,
    isError: (entry as any).isError || false,
  };
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
  server.listen(context.port, '0.0.0.0');
}

if (process.argv[1]?.endsWith('/bridge/server.js')) {
  void main();
}
