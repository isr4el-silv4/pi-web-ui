import { createBridgeClient } from './bridge-client.js';
import { createInitialState, reduceSidePanelState } from './sidepanel-state.js';
import { createToolExecutor } from './tool-executor.js';
import { resolveCwdPath } from './cwd-picker.js';
import { renderMarkdown } from './markdown-renderer.js';

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
  cookies: document.querySelector('#cookies'),
  storage: document.querySelector('#storage'),
  mode: document.querySelector('#mode'),
  devtoolsWarning: document.querySelector('#devtools-warning'),
  attachedTabsList: document.querySelector('#attached-tabs-list'),
  sessionSelect: document.querySelector('#session-select'),
  sessionError: document.querySelector('#session-error'),
};

let selectedCwd = null;
let lastFetchedCwd = null;

function fetchSessionsForCwd(cwd) {
  if (!cwd) return;
  // Only fetch sessions with absolute paths — relative paths can't be matched
  // against session records. Let the bridge resolve relative paths via new_session,
  // then session_state will fire back with the absolute cwd and trigger this again.
  const isAbsolute = cwd.startsWith('/') || /^[a-zA-Z]:/.test(cwd);
  if (!isAbsolute) return;
  if (cwd === lastFetchedCwd) return; // Already fetched
  if (!state.bridgeOnline) return;
  lastFetchedCwd = cwd;
  dispatch({ type: 'loading_sessions' });
  client.sendCommand({ type: 'list_sessions', cwd });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${month} ${day}, ${displayHours}:${minutes} ${ampm}`;
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
}

function render() {
  els.status.textContent = state.bridgeOnline ? `Bridge online · ${state.permissionMode}` : 'Bridge offline';
  els.offline.hidden = state.bridgeOnline;
  els.session.hidden = !state.bridgeOnline;
  els.cookies.checked = state.cookieAccessEnabled;
  els.storage.checked = state.storageAccessEnabled;
  els.mode.value = state.permissionMode;
  els.devtoolsWarning.hidden = !state.devtoolsConflict;
  
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

    switch (message.role) {
      case 'user':
        item.innerHTML = renderMarkdown(message.text);
        if (message.image) {
          const img = document.createElement('img');
          img.className = 'user-image';
          img.src = `data:${message.image.mimeType};base64,${message.image.data}`;
          item.appendChild(img);
        }
        break;

      case 'assistant':
        if (message.thinking) {
          const thinkingToggle = document.createElement('button');
          thinkingToggle.className = 'thinking-toggle';
          thinkingToggle.textContent = '🤔 Thinking...';
          const thinkingBlock = document.createElement('div');
          thinkingBlock.className = 'thinking-block';
          thinkingBlock.textContent = message.thinking;
          thinkingToggle.addEventListener('click', () => {
            thinkingBlock.classList.toggle('expanded');
          });
          item.appendChild(thinkingToggle);
          item.appendChild(thinkingBlock);
        }
        item.innerHTML += renderMarkdown(message.text);
        break;

      case 'tool': {
        const toolHeader = document.createElement('div');
        toolHeader.className = 'tool-name';
        toolHeader.textContent = `🔧 ${message.toolName}${message.isError ? ' (error)' : ''}`;
        item.appendChild(toolHeader);

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-result';
        toggleBtn.textContent = '▼ Show result';
        const resultDiv = document.createElement('div');
        resultDiv.className = 'tool-result';
        resultDiv.textContent = message.toolResult;
        toggleBtn.addEventListener('click', () => {
          item.classList.toggle('expanded');
          toggleBtn.textContent = item.classList.contains('expanded') ? '▲ Hide result' : '▼ Show result';
        });
        item.appendChild(toggleBtn);
        item.appendChild(resultDiv);
        break;
      }

      case 'bash': {
        const cmd = document.createElement('div');
        cmd.className = 'bash-command';
        cmd.textContent = `$ ${message.command}`;
        item.appendChild(cmd);

        const output = document.createElement('div');
        output.className = 'bash-output';
        output.textContent = message.output;
        item.appendChild(output);

        if (message.isError) item.classList.add('error');
        break;
      }

      case 'compaction': {
        const compHeader = document.createElement('div');
        compHeader.textContent = `📦 Context compacted (${message.tokensBefore} tokens summarized)`;
        item.appendChild(compHeader);

        const summary = document.createElement('div');
        summary.className = 'compaction-summary';
        summary.textContent = message.summary;
        item.appendChild(summary);
        break;
      }

      default:
        item.textContent = message.text || '';
    }

    els.messages.append(item);
  }
  // Scroll to bottom of messages
  els.messages.scrollTop = els.messages.scrollHeight;

  // Render session selector dropdown
  renderSessionSelect();

  // Render error pill
  renderErrorPill();

  // Update cwd display from session state (synced from bridge) or local input
  const sessionCwd = state.session?.cwd;
  if (sessionCwd) {
    selectedCwd = sessionCwd;
    els.cwdDisplay.textContent = sessionCwd;
    els.cwdInput.value = sessionCwd;
    els.cwdWarning.hidden = true;
    els.cwdInput.hidden = true;
  } else if (!els.cwdInput.hidden) {
    els.cwdDisplay.textContent = els.cwdInput.value || 'not set';
  }
  
  // Render attached tabs list
  console.log(`[SidePanel] render: attachedTabs=${JSON.stringify(state.attachedTabs.map(t => ({ id: t.id, title: t.title })))}`);
  els.attachedTabsList.style.display = state.attachedTabs.length === 0 ? 'none' : 'flex';
  els.attachedTabsList.innerHTML = '';
  for (const tab of state.attachedTabs) {
    const chip = document.createElement('span');
    chip.className = 'tab-chip';

    const label = document.createElement('span');
    label.className = 'tab-chip-label';
    label.textContent = tab.title;
    chip.append(label);

    const remove = document.createElement('button');
    remove.className = 'tab-chip-remove';
    remove.textContent = '×';
    remove.title = 'Detach debugger from this tab';
    remove.addEventListener('click', () => {
      toolExecutor.detachTab(tab.id);
      dispatch({ type: 'debugger_detached', tabId: tab.id });
    });
    chip.append(remove);

    els.attachedTabsList.append(chip);
  }
}

function renderSessionSelect() {
  const select = els.sessionSelect;
  const sessions = state.sessionsList;

  select.innerHTML = '';

  // "+ New Session" option
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New Session';
  select.appendChild(newOpt);

  if (sessions.length === 0) {
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— No sessions for this directory —';
    select.appendChild(noneOpt);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  for (const session of sessions) {
    const opt = document.createElement('option');
    opt.value = session.path;
    const displayName = session.name || truncate(session.firstMessage, 60) || formatDate(session.timestamp);
    opt.textContent = displayName;
    select.appendChild(opt);
  }

  // Select the currently active session if it's in the list
  const currentSessionPath = state.session?.sessionPath;
  if (currentSessionPath && sessions.some((s) => s.path === currentSessionPath)) {
    select.value = currentSessionPath;
  }
}

function renderErrorPill() {
  if (state.sessionError) {
    els.sessionError.textContent = `⚠ ${state.sessionError}`;
    els.sessionError.hidden = false;
  } else {
    els.sessionError.hidden = true;
  }
}

function dispatch(event) {
  state = reduceSidePanelState(state, event);
  render();
}

const toolExecutor = createToolExecutor(undefined, {
  onAttach: (tabId, title) => {
    console.log(`[SidePanel] onAttach fired: tabId=${tabId}, title="${title}"`);
    dispatch({ type: 'debugger_attached', tabId, title });
    // If this is the active tab, resolve any pending conflict
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict_resolved' });
      }
    });
  },
  onDetach: (tabId, reason) => {
    console.log(`[SidePanel] onDetach fired: tabId=${tabId}, reason=${reason}`);
    dispatch({ type: 'debugger_detached', tabId });
    // Check if this is the active tab for DevTools warning
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict' });
      }
    });
  },
  onReattach: (tabId) => {
    console.log(`[SidePanel] onReattach fired: tabId=${tabId}`);
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict_resolved' });
      }
    });
  },
  onAttachFailed: (tabId) => {
    console.warn(`[SidePanel] onAttachFailed: tabId=${tabId}`);
    // Auto-attach failed on a newly activated tab — show conflict if it's active
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict' });
      }
    });
  },
});

client = createBridgeClient({
  onEvent: (event) => {
    if (event.type === 'bridge_connected') {
      // Sync initial attached tabs from toolExecutor
      for (const tabId of toolExecutor.attachedTabIds) {
        chrome.tabs.get(tabId).then((tab) => {
          dispatch({ type: 'debugger_attached', tabId, title: tab.title });
        }).catch(() => {});
      }
    }
    if (event.type === 'session_state' && event.session?.cwd) {
      // Auto-fetch sessions when cwd changes
      fetchSessionsForCwd(event.session.cwd);
    }
    dispatch(event);
  },
  executeTool: (tool, params) => toolExecutor.execute(tool, params),
});
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
    const isAbsolute = path.startsWith('/') || /^[a-zA-Z]:/.test(path);
    
    selectedCwd = path;
    els.cwdDisplay.textContent = path;
    els.cwdInput.value = path;
    
    // Show warning if path is not absolute (only directory name was resolved)
    els.cwdWarning.hidden = isAbsolute;
    els.cwdInput.hidden = isAbsolute;

    // Fetch sessions only if we have an absolute path
    // If not absolute, the bridge will resolve it via new_session and
    // session_state will fire back with the correct absolute cwd
    fetchSessionsForCwd(isAbsolute ? path : null);

    if (!state.bridgeOnline) {
      dispatch({ type: 'bridge_error', error: 'Bridge is offline — cannot create session' });
      return;
    }
    // Always send the path as-is — the bridge's resolveCwd handles relative paths
    client.sendCommand({ type: 'new_session', cwd: path });
  } catch {
    // User cancelled or API not available
  }
});

// Sync cwd input field with selectedCwd
els.cwdInput.addEventListener('input', () => {
  selectedCwd = els.cwdInput.value;
  els.cwdDisplay.textContent = els.cwdInput.value || 'not set';
});

els.cookies.addEventListener('change', () => client.sendCommand({ type: 'set_cookie_access', enabled: els.cookies.checked }));
els.storage.addEventListener('change', () => client.sendCommand({ type: 'set_storage_access', enabled: els.storage.checked }));
els.mode.addEventListener('change', () => client.sendCommand({ type: 'set_permission_mode', mode: els.mode.value }));

// Session selector change handler
els.sessionSelect.addEventListener('change', () => {
  const value = els.sessionSelect.value;
  if (value === '__new__') {
    // Create new session with current cwd
    const cwd = state.session?.cwd || selectedCwd || els.cwdInput.value;
    if (cwd) {
      lastFetchedCwd = null; // Reset so sessions re-fetch after new session
      client.sendCommand({ type: 'new_session', cwd });
    }
  } else if (value) {
    // Resume session
    client.sendCommand({ type: 'resume_session', sessionPath: value });
  }
});

render();
