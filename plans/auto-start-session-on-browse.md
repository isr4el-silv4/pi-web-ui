# Auto-start New Session on Browse

## Problem

The current flow requires two steps to change the working directory:
1. Click "Browse…" → pick a directory → sets the cwd display
2. Click "New session" → sends `new_session` command to the bridge

This is unnecessarily verbose — the user already committed to the directory by picking it.

## Goal

After the user picks a directory via "Browse…", the extension **immediately** sends `new_session` to the bridge with the selected path. The "New session" button is removed.

## Changes

### 1. `chrome-extension/sidepanel.js`

**After** resolving the path from `showDirectoryPicker()`, send `new_session` immediately:

```js
els.cwdPicker.addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    const path = await resolveCwdPath(dirHandle);
    selectedCwd = path;
    els.cwdDisplay.textContent = path;
    // ... existing absolute-path warning logic ...

    // Auto-create new session with the picked directory
    if (!state.bridgeOnline) {
      dispatch({ type: 'bridge_error', error: 'Bridge is offline — cannot create session' });
      return;
    }
    client.sendCommand({ type: 'new_session', cwd: path });
  } catch {
    // User cancelled or API not available
  }
});
```

**Remove** the `els.newSession` click listener since the button is no longer needed.

### 2. `chrome-extension/sidepanel.html`

Remove the `<button id="new-session">New session</button>` element.

### 3. `chrome-extension/sidepanel-state.js`

No state changes needed — the existing `session_state` event from the bridge already updates the UI when the session is created.

### 4. Tests

- **`chrome-extension/test/sidepanel-state.test.js`** — no changes needed (state reducer is unchanged)
- **`chrome-extension/test/bridge-client.test.js`** — no changes needed (client API is unchanged)
- **`src/bridge/test/websocket-server.test.ts`** — no changes needed (server handles `new_session` the same way)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Bridge offline | Show error notification, don't attempt to send |
| User cancels picker | `catch` block swallows the error — no-op (existing behavior) |
| Path is relative (only dir name) | Still send `new_session` — bridge's `resolveCwd()` handles the search. Warning is already shown. |
| User picks same directory | Bridge creates a new session with same cwd — harmless, just a fresh session |

## Definition of Done

- [x] "Browse…" auto-sends `new_session` after directory is picked
- [x] "New session" button removed from HTML and JS
- [x] Error shown when bridge is offline
- [x] All existing tests pass
- [x] `npm run build` succeeds
