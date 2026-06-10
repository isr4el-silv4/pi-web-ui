# Network Capture: Auto-Attach & DevTools Conflict Handling

## Problem

Network capture is currently **opt-in**: the agent must explicitly call `network.startCapture()` before any requests are recorded. Additionally, when the user has Chrome DevTools open on a tab, the extension's debugger is detached and **all capture silently stops** with no user feedback.

## Goals

1. **Auto-start network capture** when the sidepanel loads — no manual `startCapture` needed
2. **Auto-reattach the debugger** when the user closes DevTools
3. **Show a visual warning** in the sidepanel UI when the debugger is detached due to DevTools being open
4. **Show a fixed header** listing all tabs with active debuggers, each with an "X" button to manually detach

## Architecture Overview

```
sidepanel.js (UI entry point)
  └── createToolExecutor()
        ├── debuggerClient          (chrome.debugger.attach/detach/sendCommand)
        ├── consoleCapture          (in-memory buffer)
        ├── networkCapture          (in-memory buffer, enabled flag)
        └── attachDebuggerEventCapture()  (global chrome.debugger.onEvent listener)
  └── createBridgeClient()
        └── WebSocket → bridge server (port 43117)
```

Key insight: `attachDebuggerEventCapture()` registers a **global** `chrome.debugger.onEvent` listener that routes CDP events into the capture buffers. This listener is always active, but `networkCapture.recordRequest()` silently drops events when `enabled = false`.

The `chrome.debugger` API is **mutually exclusive** with Chrome DevTools — only one debugger can be attached to a tab at a time.

## Implementation Plan

### Step 1: Auto-start network capture on tool executor creation

**File:** `chrome-extension/tool-executor.js`

After creating `networkCapture`, call `networkCapture.start()` so capture is enabled by default:

```js
const networkCapture = captures.networkCapture ?? createNetworkCapture();
networkCapture.start();  // <-- auto-enable capture
```

This is the minimal change. The `network.startCapture` / `network.stopCapture` commands still work as toggles.

### Step 2: Attach debugger + enable Network domain on active tab at startup

**File:** `chrome-extension/tool-executor.js`

After creating the debugger client, auto-attach to the currently active tab and enable the Network domain:

```js
// Auto-attach to the active tab on startup
(async () => {
  try {
    const tab = await debuggerClient.getCurrentTab();
    await debuggerClient.attach(tab.id);
    await debuggerClient.sendCdpCommand(tab.id, 'Network.enable', {});
    await debuggerClient.sendCdpCommand(tab.id, 'Runtime.enable', {});
  } catch {
    // Tab may be a chrome:// page or DevTools may be open — ignore
  }
})();
```

**File:** `chrome-extension/sidepanel.js`

Expose `networkCapture` from the tool executor so the sidepanel can call `start()`/`stop()` and track state:

```js
// Change createToolExecutor to return the capture instances
// (or add a getter)
```

### Step 3: Track debugger attach state per-tab

**File:** `chrome-extension/tool-executor.js`

Add a `Set` to track which tabs currently have the debugger attached, and expose methods to query this:

```js
const attachedTabs = new Set();

// On successful attach:
attachedTabs.add(tabId);

// On detach (from onDetach listener):
attachedTabs.delete(source.tabId);

// Expose:
return {
  execute(tool, params) { ... },
  isAttached(tabId) { return attachedTabs.has(tabId); },
  get attachedTabIds() { return [...attachedTabs]; },
  networkCapture,  // expose for sidepanel to call start/stop
};
```

### Step 4: Listen for `chrome.debugger.onDetach` and auto-reattach

**File:** `chrome-extension/tool-executor.js`

Register a detach listener that retries attaching every 1 second until successful:

```js
const reattachTimers = new Map();  // tabId -> intervalId

chromeApi.debugger.onDetach.addListener((source, reason) => {
  attachedTabs.delete(source.tabId);
  
  // Notify sidepanel that capture is paused for this tab
  captures.onDetach?.(source.tabId, reason);
  
  // Start retrying to re-attach (DevTools may close soon)
  const intervalId = setInterval(async () => {
    try {
      await debuggerClient.attach(source.tabId);
      await debuggerClient.sendCdpCommand(source.tabId, 'Network.enable', {});
      await debuggerClient.sendCdpCommand(source.tabId, 'Runtime.enable', {});
      attachedTabs.add(source.tabId);
      clearInterval(intervalId);
      reattachTimers.delete(source.tabId);
      
      // Notify sidepanel that capture is restored
      captures.onReattach?.(source.tabId);
    } catch {
      // DevTools still open, keep retrying
    }
  }, 1000);
  
  reattachTimers.set(source.tabId, intervalId);
});
```

### Step 5: Re-attach on tab activation

**File:** `chrome-extension/tool-executor.js`

When the user switches tabs, auto-attach to the new active tab:

```js
chromeApi.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chromeApi.tabs.get(activeInfo.tabId);
  if (!attachedTabs.has(tab.id) && !reattachTimers.has(tab.id)) {
    try {
      await debuggerClient.attach(tab.id);
      await debuggerClient.sendCdpCommand(tab.id, 'Network.enable', {});
      await debuggerClient.sendCdpCommand(tab.id, 'Runtime.enable', {});
      attachedTabs.add(tab.id);
    } catch {
      // DevTools may be open on this tab
    }
  }
});
```

### Step 6: Add DevTools conflict warning + fixed header with attached tabs list

#### 6a. Fixed header bar showing attached tabs

**File:** `chrome-extension/sidepanel.html`

Add a fixed header at the very top of the sidepanel, before the existing `<header>`:

```html
<div id="attached-tabs-bar" class="attached-tabs-bar">
  <span class="attached-tabs-label">Debugger active:</span>
  <div id="attached-tabs-list"></div>
</div>
```

Also add the DevTools warning element in the session section:

```html
<div id="devtools-warning" class="devtools-warning" hidden>
  ⚠ Chrome DevTools is open on the active tab. Pi Web UI cannot capture network requests while DevTools is open. Close DevTools (F12) to resume.
</div>
```

#### 6b. Styles

**File:** `chrome-extension/sidepanel.css`

```css
/* Fixed header bar */
.attached-tabs-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: #f6f8fa;
  border-bottom: 1px solid #ddd;
  padding: 6px 12px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attached-tabs-label {
  font-weight: 600;
  color: #555;
  margin-bottom: 2px;
}

#attached-tabs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tab-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #e8f0fe;
  border: 1px solid #c8d6e5;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  max-width: 100%;
}

.tab-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.tab-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: #888;
  padding: 0 2px;
  flex-shrink: 0;
}

.tab-chip-remove:hover {
  color: #c5221f;
}

/* DevTools warning */
.devtools-warning {
  background: #fff4ce;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #8a6d3b;
  margin-bottom: 8px;
  overflow-wrap: break-word;
}

/* Push existing header down to account for fixed bar */
header {
  padding-top: 60px;
}
```

#### 6c. State

**File:** `chrome-extension/sidepanel-state.js`

Add state for tracking DevTools conflict and attached tabs:

```js
export function createInitialState() {
  return {
    // ... existing fields
    devtoolsConflict: false,  // true when debugger is detached on active tab
    attachedTabs: [],         // array of { id, title } for tabs with active debuggers
  };
}

export function reduceSidePanelState(state, event) {
  switch (event.type) {
    // ... existing cases
    case 'devtools_conflict':
      return { ...state, devtoolsConflict: true };
    case 'devtools_conflict_resolved':
      return { ...state, devtoolsConflict: false };
    case 'debugger_attached':
      return {
        ...state,
        attachedTabs: [...state.attachedTabs, { id: event.tabId, title: event.title }],
      };
    case 'debugger_detached':
      return {
        ...state,
        attachedTabs: state.attachedTabs.filter((t) => t.id !== event.tabId),
      };
    // ...
  }
}
```

#### 6d. UI wiring

**File:** `chrome-extension/sidepanel.js`

Wire up the new elements and render the tab chips:

```js
const els = {
  // ... existing elements
  devtoolsWarning: document.querySelector('#devtools-warning'),
  attachedTabsBar: document.querySelector('#attached-tabs-bar'),
  attachedTabsList: document.querySelector('#attached-tabs-list'),
};

function render() {
  // ... existing render logic
  els.devtoolsWarning.hidden = !state.devtoolsConflict;

  // Show/hide the bar based on whether there are attached tabs
  els.attachedTabsBar.hidden = state.attachedTabs.length === 0;

  // Render attached tabs as chips with X buttons
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
```

Pass callbacks to tool executor and sync initial state on bridge connect:

```js
const toolExecutor = createToolExecutor(undefined, {
  onAttach: (tabId, title) => {
    dispatch({ type: 'debugger_attached', tabId, title });
  },
  onDetach: (tabId, reason) => {
    dispatch({ type: 'debugger_detached', tabId });

    // Check if this is the active tab for DevTools warning
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict' });
      }
    });
  },
  onReattach: (tabId) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id === tabId) {
        dispatch({ type: 'devtools_conflict_resolved' });
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
        });
      }
    }
    dispatch(event);
  },
  executeTool: (tool, params) => toolExecutor.execute(tool, params),
});
```

Also check for conflict on tab activation:

```js
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!toolExecutor.isAttached(tab.id)) {
    dispatch({ type: 'devtools_conflict' });
  } else {
    dispatch({ type: 'devtools_conflict_resolved' });
  }
});
```

### Step 7: Wire up attach/detach events in tool executor

**File:** `chrome-extension/tool-executor.js`

Add a helper for attach + notification:

```js
async function attachAndNotify(tabId) {
  await debuggerClient.attach(tabId);
  await debuggerClient.sendCdpCommand(tabId, 'Network.enable', {});
  await debuggerClient.sendCdpCommand(tabId, 'Runtime.enable', {});
  attachedTabs.add(tabId);

  // Notify sidepanel
  const tab = await chromeApi.tabs.get(tabId);
  captures.onAttach?.(tabId, tab.title);
}
```

Update the `onDetach` listener to notify the sidepanel:

```js
chromeApi.debugger.onDetach.addListener((source, reason) => {
  attachedTabs.delete(source.tabId);
  captures.onDetach?.(source.tabId, reason);
  // ... reattach retry logic as in Step 4
});
```

Add a manual detach method for the "X" button:

```js
async function detachTab(tabId) {
  // Clear any reattach timer for this tab
  const timerId = reattachTimers.get(tabId);
  if (timerId) {
    clearInterval(timerId);
    reattachTimers.delete(tabId);
  }

  if (attachedTabs.has(tabId)) {
    await debuggerClient.detach(tabId);
    attachedTabs.delete(tabId);
  }
}
```

Expose in the return value:

```js
return {
  execute(tool, params) { ... },
  isAttached(tabId) { return attachedTabs.has(tabId); },
  get attachedTabIds() { return [...attachedTabs]; },
  networkCapture,
  detachTab,  // <-- new
};
```

### Step 8: Update tests

**Files to update:**

- `chrome-extension/test/tool-executor.test.js` — test auto-attach on creation, test that `networkCapture.start()` is called, test `detachTab()` clears reattach timer and calls `debugger.detach()`
- `chrome-extension/test/debugger-events.test.js` — test detach listener and reattach retry logic, test `onAttach`/`onDetach` callbacks fire correctly
- `chrome-extension/test/sidepanel-state.test.js` — test `devtools_conflict`, `devtools_conflict_resolved`, `debugger_attached` (appends to `attachedTabs`), and `debugger_detached` (removes from `attachedTabs`) events
- `chrome-extension/test/network-capture.test.js` — no changes needed (existing tests still valid)

## Files Modified (Summary)

| File | Change |
|------|--------|
| `tool-executor.js` | Auto-start capture, auto-attach on load, `attachAndNotify` helper, detach/reattach logic, tab activation listener, `detachTab()` method, expose state |
| `sidepanel.js` | Wire up attach/detach/reattach callbacks, render tab chips with X buttons, sync initial state on bridge connect, tab activation check |
| `sidepanel.html` | Add `#attached-tabs-bar` fixed header, `#attached-tabs-list`, `#devtools-warning` element |
| `sidepanel.css` | Add `.attached-tabs-bar`, `.tab-chip`, `.tab-chip-remove`, `.devtools-warning` styles; adjust `header` padding |
| `sidepanel-state.js` | Add `devtoolsConflict`, `attachedTabs` state fields and reducer cases |
| `test/tool-executor.test.js` | Tests for auto-attach, detach, reattach, manual detach |
| `test/debugger-events.test.js` | Tests for detach listener and callbacks |
| `test/sidepanel-state.test.js` | Tests for new state events |

## Edge Cases & Considerations

1. **chrome:// and extension pages** — `chrome.debugger.attach()` fails on these. The auto-attach should catch and ignore these errors silently.

2. **Multiple tabs** — The extension may have the debugger attached to multiple tabs simultaneously. The `attachedTabs` Set tracks this. The DevTools warning only shows for the **active** tab.

3. **Reattach interval cleanup** — When the sidepanel closes, all reattach intervals should be cleared to avoid background activity. This could be handled with a `dispose()` method on the tool executor.

4. **Network domain enable** — After re-attaching, we must re-send `Network.enable` (and `Runtime.enable`) because the CDP session is fresh.

5. **Lost data during DevTools** — Requests that happened while DevTools was open are permanently lost. The warning should make this clear.

6. **Race conditions on tab switch** — If the user switches tabs rapidly, the `onActivated` handler may fire before the previous attach completes. The `reattachTimers` Map prevents duplicate retries.

## Non-Goals (Future Work)

- Reading `performance.getEntriesByType('resource')` as a fallback when DevTools is open (basic timing data without headers/bodies)
- Using `chrome.webRequest` API as a parallel capture mechanism (always-on, but no response bodies)
- Persisting captured requests across sidepanel close/reopen
