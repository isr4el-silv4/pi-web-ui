import { createBridgeClient } from './bridge-client.js';
import { createInitialState, reduceSidePanelState } from './sidepanel-state.js';
import { createToolExecutor } from './tool-executor.js';
import { resolveCwdPath } from './cwd-picker.js';

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
  sendButton: document.querySelector('#prompt-form button'),
  cwdDisplay: document.querySelector('#cwd-display'),
  cwdPicker: document.querySelector('#cwd-picker'),
  cwdWarning: document.querySelector('#cwd-warning'),
  cwdInput: document.querySelector('#cwd-input'),
  newSession: document.querySelector('#new-session'),
  cookies: document.querySelector('#cookies'),
  storage: document.querySelector('#storage'),
  mode: document.querySelector('#mode'),
};

let selectedCwd = null;

function render() {
  els.status.textContent = state.bridgeOnline ? `Bridge online · ${state.permissionMode}` : 'Bridge offline';
  els.offline.hidden = state.bridgeOnline;
  els.session.hidden = !state.bridgeOnline;
  els.cookies.checked = state.cookieAccessEnabled;
  els.storage.checked = state.storageAccessEnabled;
  els.mode.value = state.permissionMode;
  
  // Update send button state
  const isDisabled = !state.bridgeOnline || state.sending;
  els.sendButton.disabled = isDisabled;
  els.sendButton.textContent = state.sending ? 'Sending...' : 'Send';
  els.prompt.disabled = isDisabled;
  
  // Show send error if present
  let errorEl = document.querySelector('#send-error');
  if (state.sendError) {
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'send-error';
      errorEl.className = 'send-error';
      els.form.parentNode.insertBefore(errorEl, els.form);
    }
    errorEl.textContent = `⚠ ${state.sendError}`;
    errorEl.hidden = false;
  } else if (errorEl) {
    errorEl.hidden = true;
  }
  
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
  // Scroll to bottom of messages
  els.messages.scrollTop = els.messages.scrollHeight;
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
  if (!state.bridgeOnline) {
    dispatch({ type: 'bridge_error', error: 'Bridge is offline — cannot send message' });
    return;
  }
  dispatch({ type: 'user_message', text: message });
  try {
    client.sendCommand({ type: 'prompt', message });
  } catch (error) {
    dispatch({ type: 'prompt_error', message, error: error.message });
  }
  els.prompt.value = '';
});

els.cwdPicker.addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    const path = await resolveCwdPath(dirHandle);
    selectedCwd = path;
    els.cwdDisplay.textContent = path;
    // Show warning if path is not absolute (only directory name was resolved)
    const isAbsolute = path.startsWith('/') || /^[a-zA-Z]:/.test(path);
    els.cwdWarning.hidden = isAbsolute;
    els.cwdInput.hidden = isAbsolute;
    if (!isAbsolute) {
      els.cwdInput.value = path;
    }
  } catch {
    // User cancelled or API not available
  }
});

// Sync cwd input field with selectedCwd
els.cwdInput.addEventListener('input', () => {
  selectedCwd = els.cwdInput.value;
  els.cwdDisplay.textContent = els.cwdInput.value || 'not set';
});

els.newSession.addEventListener('click', () => {
  const cwd = els.cwdInput.hidden ? (selectedCwd || '/') : (els.cwdInput.value || selectedCwd || '/');
  client.sendCommand({ type: 'new_session', cwd });
});
els.cookies.addEventListener('change', () => client.sendCommand({ type: 'set_cookie_access', enabled: els.cookies.checked }));
els.storage.addEventListener('change', () => client.sendCommand({ type: 'set_storage_access', enabled: els.storage.checked }));
els.mode.addEventListener('change', () => client.sendCommand({ type: 'set_permission_mode', mode: els.mode.value }));

render();
