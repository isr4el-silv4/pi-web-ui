# Abort Button Implementation

## Goal
Replace the "Send" button with an "Abort" button when the agent is busy, allowing the user to interrupt the current agent operation — matching the terminal ESC key behavior.

## Behavior

- **Abort button visible**: Immediately after the user sends a message, until the agent finishes its turn (including all tool calls). This covers the entire `sending` state.
- **Abort button click**: Sends `{ type: 'abort' }` to the bridge, which calls `sdkSession.abort()` on the SDK session.
- **After abort**: Shows an "⚠ Aborted" system message in the chat. User can immediately send a new message.
- **Button toggle**: "Send" ↔ "Abort" — only one visible at a time in the same spot.

## Files to Modify (5 files)

### 1. `chrome-extension/sidepanel.html`

Add an abort button next to the send button inside `#prompt-form`:

```html
<button id="abort-button" hidden>Abort</button>
```

Place it between `<input id="prompt">` and `<button>Send</button>` (or replace the Send button entirely — either approach works, but a separate hidden button keeps the DOM stable).

### 2. `chrome-extension/sidepanel.css`

Add styling for the abort button — red/danger styling to signal a destructive action:

```css
#abort-button {
  background: #c5221f;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0 16px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}

#abort-button:hover {
  background: #a41514;
}
```

### 3. `chrome-extension/sidepanel-state.js`

Add two new event handlers to `reduceSidePanelState`:

```js
case 'abort_sent':
  // Optimistic: user clicked abort — show "Aborted" message, clear sending state
  return {
    ...state,
    sending: false,
    sendError: null,
    messages: [...state.messages, { role: 'system', text: '⚠ Aborted' }],
  };
case 'abort_received':
  // Server confirmed abort — no additional UI change needed
  return state;
```

### 4. `chrome-extension/sidepanel.js`

#### 4a. Add abort button element reference:

```js
const els = {
  // ... existing refs ...
  abortButton: document.querySelector('#abort-button'),
};
```

#### 4b. Update `render()` — toggle Send/Abort visibility:

Replace the existing send button state logic:

```js
// Update Send/Abort button toggle
const isBusy = state.sending;
els.sendButton.hidden = isBusy;
els.abortButton.hidden = !isBusy;
els.prompt.disabled = !state.bridgeOnline || isBusy;
```

Remove the old `els.sendButton.disabled` / `els.sendButton.textContent` logic since we're toggling visibility instead.

#### 4c. Add abort click handler (after the form submit handler):

```js
els.abortButton.addEventListener('click', () => {
  if (!state.bridgeOnline) return;
  try {
    client.sendCommand({ type: 'abort' });
  } catch (error) {
    dispatch({ type: 'bridge_error', error: error.message });
    return;
  }
  dispatch({ type: 'abort_sent' });
});
```

#### 4d. Render `system` role messages in the message loop:

Add a `case 'system'` in the render switch:

```js
case 'system':
  item.textContent = message.text;
  break;
```

### 5. `src/bridge/server.ts`

Replace the `abort` case to actually call `sdkSession.abort()`:

**Before:**
```ts
case 'abort':
  clients.broadcast({ type: 'abort_received' });
  return sessions.getCurrentSession();
```

**After:**
```ts
case 'abort':
  if (sdkSession && typeof (sdkSession as any).abort === 'function') {
    ready.then(() => {
      (sdkSession as any).abort().catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        clients.broadcast({ type: 'bridge_error', error: `Abort failed: ${errorMessage}` });
      });
    });
  }
  clients.broadcast({ type: 'abort_received' });
  return sessions.getCurrentSession();
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Optimistic abort UI | Update immediately on click — no lag. `sendCommand` throws if WS is disconnected, so we can show an error |
| "Aborted" as a chat message | Keeps it in the conversation flow, more prominent than the notifications area |
| No intermediate "Aborting..." state | SDK abort is typically <100ms. Adding a loading state adds complexity for minimal UX gain |
| Toggle Send/Abort (not disable) | Clearer visual signal — the button changes purpose, not just state |
| `system` role handled in JS only | UI-only role, never crosses the wire — no TS protocol type changes needed |

## Out of Scope

- **Abort during compaction** — SDK has a separate `abortCompaction()` method; can be added later
- **Per-tool abort** — SDK's `abort()` cancels the entire agent turn, consistent with terminal ESC
- **`tool_call`/`tool_result` in chat** — Pre-existing: these events are not rendered as chat messages
