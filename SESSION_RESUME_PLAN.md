# Session Resume — Implementation Plan

## Goal

Enable users to resume a previous Pi session from within the Chrome extension, with a rich conversation history display and full model context continuity.

## User Story

1. User picks a working directory via the "Browse…" button (or has one from `session_state`).
2. A "Resume" dropdown appears next to the Browse button, auto-populated with sessions for that directory.
3. User selects a session → chat clears and repopulates with the full conversation history (rich rendering).
4. User can continue the conversation seamlessly — the model has full context.
5. User can also select "+ New Session" from the dropdown to start fresh.
6. Errors display as a red pill with a description.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ sidepanel.js │  │ sidepanel    │  │ sidepanel-state.js│  │
│  │ (logic)     │  │ .html/.css   │  │ (reducer)         │  │
│  └──────┬──────┘  └──────────────┘  └────────┬──────────┘  │
│         │                                     │              │
│         ▼                                     ▼              │
│  ┌──────────────┐                          ┌──────────────┐  │
│  │ bridge-client │◄──── WebSocket ──────►  │  markdown    │  │
│  │   .js        │                           │  -renderer.js │  │
│  └──────────────┘                           └──────────────┘  │
└─────────────┬──────────────────────────────────────────────────┘
              │ ws://127.0.0.1:43117
              ▼
┌──────────────────────────────────────────────────────────────┐
│                        Bridge (Node.js)                       │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  server.ts   │  │ session-registry │  │ sdk-session.ts│  │
│  │ (handlers)   │  │                  │  │ (SessionMgr)  │  │
│  └──────────────┘  └──────────────────┘  └───────────────┘  │
│                                                              │
│  New commands:                                               │
│    list_sessions  →  SessionManager.list(cwd) + metadata     │
│    resume_session →  SessionManager.open(path) + history     │
└──────────────────────────────────────────────────────────────┘
```

## Rich Message Model

The current message schema is:
```js
{ role: 'user' | 'assistant', text: string }
```

Expanded to Level 2 (Rich):
```js
{
  role: 'user' | 'assistant' | 'tool' | 'bash' | 'compaction',
  text?: string,           // Main content (markdown for assistant)
  toolName?: string,       // Tool name for tool messages
  toolResult?: string,     // Tool result text (collapsed by default)
  isError?: boolean,       // Whether tool/bash failed
  image?: { data: string, mimeType: string },  // Image attachment
  thinking?: string,       // Collapsible thinking block
  exitCode?: number,       // Bash exit code
  command?: string,        // Bash command
  summary?: string,        // Compaction summary
  tokensBefore?: number,   // Tokens before compaction
}
```

## File Changes

### 1. `src/protocol/messages.ts`

**Add to `ClientCommand`:**
```typescript
| { type: 'list_sessions'; cwd: string }
```

**Add to `ServerEvent`:**
```typescript
| { type: 'sessions_list'; sessions: Array<{ path: string; name?: string; timestamp: string }> }
| { type: 'session_history'; messages: Array<SessionHistoryMessage> }
```

**Add `SessionHistoryMessage` type:**
```typescript
export type SessionHistoryMessage =
  | { role: 'user'; text: string; image?: { data: string; mimeType: string } }
  | { role: 'assistant'; text: string; thinking?: string }
  | { role: 'tool'; toolName: string; toolResult: string; isError: boolean }
  | { role: 'bash'; command: string; output: string; exitCode: number | undefined; isError: boolean }
  | { role: 'compaction'; summary: string; tokensBefore: number };
```

**Update `isClientCommand()`:** Add `case 'list_sessions'` → `return typeof value.cwd === 'string'`.

---

### 2. `src/bridge/server.ts`

**New handler — `list_sessions`:**
```typescript
case 'list_sessions': {
  const sessions = await listSessionsForCwd(command.cwd);
  clients.broadcast({ type: 'sessions_list', sessions });
  return sessions;
}
```

Uses SDK's `SessionManager.list(cwd)` to enumerate session files, then for each:
- `SessionManager.open(path).getSessionName()` → display name (or null)
- `SessionManager.open(path).getHeader()` → timestamp

**Enhanced handler — `resume_session`:**
After the existing SDK session creation, stream history:
```typescript
case 'resume_session': {
  // 1. Stream history to extension
  const history = await buildSessionHistory(command.sessionPath);
  clients.broadcast({ type: 'session_history', messages: history });

  // 2. Create/update session in registry
  const session = sessions.resumeSession(command.sessionPath, { cwd: options.context.cwd });

  // 3. Create SDK session (existing logic)
  ready = sdkHost.create({ cwd: options.context.cwd, sessionPath: command.sessionPath })
    .then((created) => { sdkSession = created; setupSdkSubscription(created); })
    .catch((error) => {
      clients.broadcast({ type: 'error', error: `Resume failed: ${error.message}` });
    });

  return session;
}
```

**New helper — `buildSessionHistory(sessionPath)`:**
```typescript
import { SessionManager } from '@earendil-works/pi-coding-agent';

async function buildSessionHistory(sessionPath: string): Promise<SessionHistoryMessage[]> {
  const manager = SessionManager.open(sessionPath);
  const context = manager.buildSessionContext();
  const messages: SessionHistoryMessage[] = [];

  for (const entry of context.messages) {
    switch (entry.role) {
      case 'user':
        messages.push(mapUserMessage(entry));
        break;
      case 'assistant':
        messages.push(mapAssistantMessage(entry));
        break;
      case 'toolResult':
        messages.push(mapToolResult(entry));
        break;
      case 'bashExecution':
        messages.push(mapBashExecution(entry));
        break;
      case 'compactionSummary':
        messages.push(mapCompaction(entry));
        break;
    }
  }
  return messages;
}
```

Each `map*` function extracts text from content blocks, handles images, thinking, etc.

**New helper — `listSessionsForCwd(cwd)`:**
```typescript
async function listSessionsForCwd(cwd: string): Promise<Array<{ path: string; name?: string; timestamp: string }>> {
  const sessionFiles = await SessionManager.list(cwd);
  const results = [];
  for (const path of sessionFiles) {
    const manager = SessionManager.open(path);
    const header = manager.getHeader();
    const name = manager.getSessionName(); // null if not set
    results.push({ path, name: name || undefined, timestamp: header.timestamp });
  }
  // Sort by timestamp descending (most recent first)
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return results;
}
```

---

### 3. `chrome-extension/sidepanel-state.js`

**New initial state fields:**
```js
sessionsList: [],       // Array of { path, name, timestamp, displayName }
loadingSessions: false,
sessionError: null,
```

**New reducer cases:**
```js
case 'loading_sessions':
  return { ...state, loadingSessions: true, sessionError: null };

case 'sessions_loaded':
  return { ...state, sessionsList: event.sessions, loadingSessions: false };

case 'session_error':
  return { ...state, sessionError: event.error, loadingSessions: false };

case 'session_history':
  // Clear existing messages and replace with history
  return { ...state, messages: event.messages, sending: false };
```

---

### 4. `chrome-extension/sidepanel.html`

Add session selector next to the cwd label:
```html
<div class="cwd-row">
  <label>cwd <span id="cwd-display">not set</span> <button id="cwd-picker">Browse…</button></label>
  <label class="resume-label">
    Resume
    <select id="session-select" disabled>
      <option value="">— No sessions for this directory —</option>
    </select>
  </label>
</div>
```

Add error pill container:
```html
<div id="session-error" class="error-pill" hidden></div>
```

---

### 5. `chrome-extension/sidepanel.js`

**New DOM references:**
```js
sessionSelect: document.querySelector('#session-select'),
sessionError: document.querySelector('#session-error'),
```

**Auto-fetch sessions on cwd change:**
```js
// Track last fetched cwd to avoid redundant calls
let lastFetchedCwd = null;

function fetchSessionsForCwd(cwd) {
  if (cwd === lastFetchedCwd) return; // Already fetched
  if (!state.bridgeOnline) return;
  lastFetchedCwd = cwd;
  dispatch({ type: 'loading_sessions' });
  client.sendCommand({ type: 'list_sessions', cwd });
}
```

Called from:
- `cwd-picker` click handler (after `new_session` is sent)
- `session_state` event (when cwd syncs from bridge)

**Populate dropdown from `sessions_loaded`:**
```js
// In render():
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
    opt.textContent = session.displayName || truncate(session.firstMessage, 60) || formatDate(session.timestamp);
    select.appendChild(opt);
  }
}
```

**Handle dropdown change:**
```js
els.sessionSelect.addEventListener('change', () => {
  const value = els.sessionSelect.value;
  if (value === '__new__') {
    // Create new session with current cwd
    const cwd = state.session?.cwd || els.cwdInput.value;
    if (cwd) {
      client.sendCommand({ type: 'new_session', cwd });
    }
  } else if (value) {
    // Resume session
    client.sendCommand({ type: 'resume_session', sessionPath: value });
  }
});
```

**Error pill display:**
```js
function renderErrorPill() {
  if (state.sessionError) {
    els.sessionError.textContent = `⚠ ${state.sessionError}`;
    els.sessionError.hidden = false;
  } else {
    els.sessionError.hidden = true;
  }
}
```

---

### 6. `chrome-extension/sidepanel.css`

```css
.cwd-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.resume-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

#session-select {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  max-width: 300px;
}

#session-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-pill {
  background: #fce8e6;
  color: #c5221f;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  display: inline-block;
  margin: 4px 0;
}

/* Rich message types */
.message.tool {
  background: #f0f0f0;
  border-left: 3px solid #666;
}

.message.tool .tool-name {
  font-weight: 600;
  font-family: monospace;
  font-size: 12px;
}

.message.tool .tool-result {
  display: none; /* Collapsed by default */
  margin-top: 4px;
  padding: 6px;
  background: #e8e8e8;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.message.tool.expanded .tool-result {
  display: block;
}

.message.tool .toggle-result {
  background: none;
  border: none;
  color: #0969da;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}

.message.bash {
  background: #1e1e1e;
  color: #d4d4d4;
  border-left: 3px solid #4caf50;
}

.message.bash.error {
  border-left-color: #c5221f;
}

.message.bash .bash-command {
  font-family: monospace;
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.message.bash .bash-output {
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.message.compaction {
  background: #fff4ce;
  border-left: 3px solid #d4a017;
  font-style: italic;
}

.message.compaction .compaction-summary {
  margin-top: 4px;
}

.message.assistant .thinking-block {
  background: #f6f8fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  margin: 8px 0;
  font-size: 12px;
  color: #666;
  display: none;
}

.message.assistant .thinking-block.expanded {
  display: block;
}

.message.assistant .thinking-toggle {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  text-decoration: underline;
}

.message.user .user-image {
  max-width: 200px;
  border-radius: 4px;
  margin-top: 4px;
}
```

---

### 7. `chrome-extension/sidepanel.js` — Rich Message Rendering

Update the `render()` function's message loop:

```js
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
        const toggle = document.createElement('button');
        toggle.className = 'thinking-toggle';
        toggle.textContent = '🤔 Thinking...';
        const thinking = document.createElement('div');
        thinking.className = 'thinking-block';
        thinking.textContent = message.thinking;
        toggle.addEventListener('click', () => {
          thinking.classList.toggle('expanded');
        });
        item.appendChild(toggle);
        item.appendChild(thinking);
      }
      item.innerHTML += renderMarkdown(message.text);
      break;

    case 'tool':
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

    case 'bash':
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

    case 'compaction':
      const compHeader = document.createElement('div');
      compHeader.textContent = `📦 Context compacted (${message.tokensBefore} tokens summarized)`;
      item.appendChild(compHeader);

      const summary = document.createElement('div');
      summary.className = 'compaction-summary';
      summary.textContent = message.summary;
      item.appendChild(summary);
      break;
  }

  els.messages.append(item);
}
```

---

### 8. Tests

#### `src/protocol/test/messages.test.ts`
- `isClientCommand({ type: 'list_sessions', cwd: '/project' })` → `true`
- `isClientCommand({ type: 'list_sessions' })` → `false` (missing cwd)

#### `src/bridge/test/server-sdk.test.ts`
- `list_sessions` handler returns sessions from `SessionManager.list()`
- `resume_session` broadcasts `session_history` before creating SDK session
- Error handling: corrupted session file → broadcasts error

#### `chrome-extension/test/bridge-client.test.js`
- Sends `list_sessions` command with cwd
- Receives `sessions_list` event
- Receives `session_history` event

#### `chrome-extension/test/sidepanel-state.test.js`
- `loading_sessions` sets `loadingSessions: true`
- `sessions_loaded` populates `sessionsList`
- `session_error` sets error message
- `session_history` clears old messages, sets new ones

---

## Session Display Name Resolution

For the dropdown, each session is displayed as:

1. **`name`** — from `SessionManager.getSessionName()` (set via `/name` in Pi)
2. **First user message** — parsed from JSONL, truncated to ~60 chars
3. **Timestamp** — from header, formatted as "Jun 13, 2:30 PM"

Fallback chain: `name || firstUserMessage || formattedTimestamp`

---

## Error Handling

| Scenario | Error Display |
|----------|--------------|
| No sessions for cwd | Dropdown disabled, "No sessions for this directory" |
| Corrupted JSONL file | Red pill: "Failed to load session: invalid JSONL" |
| SDK session creation fails | Red pill: "Resume failed: [SDK error message]" |
| Bridge offline when listing | No-op (already shows "Bridge offline") |
| Session file not found | Red pill: "Session file not found: [path]" |

---

## Edge Cases

- **Cwd changes mid-session:** Clear `lastFetchedCwd`, re-fetch sessions on new cwd.
- **User resumes same session twice:** No-op on second resume (SDK handles gracefully).
- **Very long conversations:** No limit — stream all messages. Consider virtualization if performance becomes an issue (future).
- **Session in different cwd:** Sessions are filtered by cwd, so this can't happen via the dropdown.
- **New session while sessions exist:** "+ New Session" option always present as first dropdown entry.

---

## Implementation Order

1. **Protocol types** — `messages.ts` (foundation, no behavior change)
2. **Bridge `list_sessions`** — scan sessions, return metadata
3. **Bridge `resume_session` history** — `buildSessionHistory()` + broadcast
4. **Extension state** — new fields and reducer cases
5. **Extension HTML/CSS** — dropdown, error pill, rich message styles
6. **Extension JS** — wiring, auto-fetch, dropdown logic, rich rendering
7. **Tests** — protocol, bridge, client, state
