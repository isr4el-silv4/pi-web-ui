import { createBridgeClient } from './bridge-client.js';
import { createInitialState, reduceSidePanelState } from './sidepanel-state.js';
import { createToolExecutor } from './tool-executor.js';

let state = createInitialState();
let client;

const els = {
  status: document.querySelector('#status'),
  offline: document.querySelector('#offline'),
  session: document.querySelector('#session'),
  messages: document.querySelector('#messages'),
  uiRequests: document.querySelector('#ui-requests'),
  notifications: document.querySelector('#notifications'),
  form: document.querySelector('#prompt-form'),
  prompt: document.querySelector('#prompt'),
  cwd: document.querySelector('#cwd'),
  newSession: document.querySelector('#new-session'),
  cookies: document.querySelector('#cookies'),
  storage: document.querySelector('#storage'),
  mode: document.querySelector('#mode'),
};

function render() {
  els.status.textContent = state.bridgeOnline ? `Bridge online · ${state.permissionMode}` : 'Bridge offline';
  els.offline.hidden = state.bridgeOnline;
  els.session.hidden = !state.bridgeOnline;
  els.cookies.checked = state.cookieAccessEnabled;
  els.storage.checked = state.storageAccessEnabled;
  els.mode.value = state.permissionMode;
  els.uiRequests.innerHTML = '';
  for (const request of state.uiRequests) {
    const item = document.createElement('div');
    item.className = 'message';
    item.textContent = request.message ?? request.kind;
    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.addEventListener('click', () => {
      client.sendCommand({ type: 'extension_ui_response', id: request.id, value: request.kind === 'confirm' ? true : '' });
      dispatch({ type: 'extension_ui_response_sent', id: request.id });
    });
    item.append(ok);
    els.uiRequests.append(item);
  }
  els.notifications.textContent = state.notifications.join('\n');
  els.messages.innerHTML = '';
  for (const message of state.messages) {
    const item = document.createElement('div');
    item.className = `message ${message.role}`;
    item.textContent = message.text;
    els.messages.append(item);
  }
}

function dispatch(event) {
  state = reduceSidePanelState(state, event);
  render();
}

const toolExecutor = createToolExecutor();
client = createBridgeClient({ onEvent: dispatch, executeTool: (tool, params) => toolExecutor.execute(tool, params) });
client.connect();

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = els.prompt.value.trim();
  if (!message) return;
  dispatch({ type: 'user_message', text: message });
  client.sendCommand({ type: 'prompt', message });
  els.prompt.value = '';
});

els.newSession.addEventListener('click', () => client.sendCommand({ type: 'new_session', cwd: els.cwd.value || '/' }));
els.cookies.addEventListener('change', () => client.sendCommand({ type: 'set_cookie_access', enabled: els.cookies.checked }));
els.storage.addEventListener('change', () => client.sendCommand({ type: 'set_storage_access', enabled: els.storage.checked }));
els.mode.addEventListener('change', () => client.sendCommand({ type: 'set_permission_mode', mode: els.mode.value }));

render();
