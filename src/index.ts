import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createPiWebUiController, type PiWebUiController } from './pi-extension/launcher.js';
import { type JsonObject } from './protocol/index.js';

let controller: PiWebUiController | undefined;
export function getController() { return controller; }
export function setController(c: PiWebUiController | undefined) { controller = c; }

const browserToolNames = [
  'browser_list_tabs',
  'browser_get_current_tab',
  'browser_get_page_html',
  'browser_get_page_text',
  'browser_get_selection',
  'browser_capture_screenshot',
  'browser_get_console_logs',
  'browser_clear_console_log_buffer',
  'browser_start_network_capture',
  'browser_stop_network_capture',
  'browser_get_network_requests',
  'browser_get_network_request',
  'browser_get_network_response_body',
  'browser_attach_debugger',
  'browser_detach_debugger',
  'browser_send_cdp_command',
  'browser_evaluate_script',
  'browser_get_cookies',
  'browser_get_local_storage',
  'browser_get_session_storage',
];

const browserToolDescriptions: Record<string, string> = {
  browser_list_tabs: 'List all open browser tabs',
  browser_get_current_tab: 'Get the currently active tab URL and title',
  browser_get_page_html: 'Get the HTML content of the current page',
  browser_get_page_text: 'Get the text content of the current page',
  browser_get_selection: 'Get the currently selected text on the page',
  browser_capture_screenshot: 'Capture a screenshot of the current page',
  browser_get_console_logs: 'Get console logs from the browser',
  browser_clear_console_log_buffer: 'Clear the console log buffer',
  browser_start_network_capture: 'Start capturing network requests',
  browser_stop_network_capture: 'Stop capturing network requests',
  browser_get_network_requests: 'Get captured network requests',
  browser_get_network_request: 'Get a specific network request by ID',
  browser_get_network_response_body: 'Get the response body of a network request',
  browser_attach_debugger: 'Attach the Chrome debugger to the current tab',
  browser_detach_debugger: 'Detach the Chrome debugger from the current tab',
  browser_send_cdp_command: 'Send a Chrome DevTools Protocol command (requires confirmation)',
  browser_evaluate_script: 'Evaluate JavaScript in the current page (requires confirmation)',
  browser_get_cookies: 'Get cookies for the current page',
  browser_get_local_storage: 'Get local storage for the current page',
  browser_get_session_storage: 'Get session storage for the current page',
};

export function createPiWebUiCommand() {
  return {
    description: 'Manage pi-web-ui bridge — /pi-web-ui start, /pi-web-ui stop, /pi-web-ui status, /pi-web-ui open',
    getArgumentCompletions: (prefix = '') => {
      const suggestions = ['start', 'stop', 'status', 'open'];
      return suggestions
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },
    handler: async (args = '', ctx: ExtensionContext) => {
      const sub = args.trim();
      const cwd = ctx.cwd ?? process.cwd();

      if (!controller) {
        controller = createPiWebUiController();
      }
      if (sub === 'start' && !controller) {
        controller = createPiWebUiController();
      }

      try {
        switch (sub) {
          case 'start': {
            const result = await controller.start({ cwd });
            ctx.ui.notify(`pi-web-ui bridge started on port ${(result as { port?: number }).port ?? 43117}`, 'info');
            break;
          }
          case 'stop': {
            await controller.stop();
            controller = undefined;
            ctx.ui.notify('pi-web-ui bridge stopped', 'info');
            break;
          }
          case 'status': {
            const status = await controller.status();
            ctx.ui.notify(`pi-web-ui bridge status: ${status}`, 'info');
            break;
          }
          case 'open': {
            await controller.open();
            ctx.ui.notify('pi-web-ui side panel opened', 'info');
            break;
          }
          default:
            ctx.ui.notify(
              'Usage: /pi-web-ui [start|stop|status|open]',
              'warning',
            );
        }
      } catch (error) {
        ctx.ui.notify(
          `pi-web-ui error: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  };
}

export function registerPiWebUiTools(pi: ExtensionAPI) {
  for (const name of browserToolNames) {
    pi.registerTool({
      name,
      label: name,
      description: browserToolDescriptions[name] ?? `Execute browser tool ${name}`,
      parameters: { type: 'object', additionalProperties: true },
      execute: async (_toolCallId, params = {}, _signal, _onUpdate, _ctx) => {
        if (!controller) {
          return { content: [{ type: 'text', text: 'pi-web-ui bridge not started. Run /pi-web-ui start first.' }], details: {} };
        }
        try {
          const result = await controller.requestBrowserTool(name, params as JsonObject);
          return { content: [{ type: 'text', text: JSON.stringify(result) }], details: {} };
        } catch (error) {
          return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], details: {} };
        }
      },
    });
  }
}

export default function createExtension(pi: ExtensionAPI) {
  pi.registerCommand('pi-web-ui', createPiWebUiCommand());

  pi.on('session_start', async (_event, _ctx) => {
    registerPiWebUiTools(pi);
  });

  pi.on('session_shutdown', async (_event, _ctx) => {
    if (controller) {
      await controller.stop();
      controller = undefined;
    }
  });
}
