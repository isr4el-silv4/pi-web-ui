import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isClientCommand, type ClientCommand } from '../protocol/index.js';
import { createBrowserClientRegistry } from './browser-client.js';
import { createSessionRegistry } from './session-registry.js';
import { parseStartContext, type BridgeStartContext } from './start-context.js';
import { attachWebSocketServer } from './websocket-server.js';

export function createBridgeApp(options: { context: BridgeStartContext; pid?: number; sdkHost?: { create(options: { cwd: string; sessionPath?: string }): Promise<unknown> }; ui?: { respond(response: { id: string; value: unknown }): boolean } }) {
  const clients = createBrowserClientRegistry();
  const sessions = createSessionRegistry();
  sessions.createSession(options.context);
  let sdkSession: unknown;
  let ready = options.sdkHost?.create({ cwd: options.context.cwd, sessionPath: options.context.sessionPath }).then((session) => { sdkSession = session; });

  const app = {
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
          ready = options.sdkHost?.create({ cwd: command.cwd }).then((created) => { sdkSession = created; });
          return session;
        }
        case 'resume_session': {
          const session = sessions.resumeSession(command.sessionPath, { cwd: options.context.cwd });
          ready = options.sdkHost?.create({ cwd: options.context.cwd, sessionPath: command.sessionPath }).then((created) => { sdkSession = created; });
          return session;
        }
        case 'set_permission_mode':
          return sessions.setPermissionMode(command.mode);
        case 'set_cookie_access':
          return sessions.setCookieAccess(command.enabled);
        case 'set_storage_access':
          return sessions.setStorageAccess(command.enabled);
        case 'prompt':
          clients.broadcast({ type: 'prompt_received', message: command.message });
          return sessions.getCurrentSession();
        case 'abort':
          clients.broadcast({ type: 'abort_received' });
          return sessions.getCurrentSession();
        case 'extension_ui_response':
          return { handled: options.ui?.respond({ id: command.id, value: command.value }) ?? false };
      }
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
    if (request.method === 'POST' && request.url === '/command') {
      const parsed = JSON.parse(await readBody(request)) as unknown;
      if (!isClientCommand(parsed)) return sendJson(response, 400, { error: 'Invalid client command' });
      return sendJson(response, 200, app.handleClientCommand(parsed));
    }
    return sendJson(response, 404, { error: 'Not found' });
  });
  attachWebSocketServer(server, app);
  return server;
}

export async function main() {
  const context = parseStartContext(process.env.PI_WEB_UI_START_CONTEXT);
  const server = createHttpServer(context);
  server.listen(context.port, '127.0.0.1');
}

if (process.argv[1]?.endsWith('/bridge/server.js')) {
  void main();
}
