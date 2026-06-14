# Remove Permission Mode Selector

## Goal

Remove the `observe`/`debug`/`control` permission mode selector from the Chrome extension UI and simplify the bridge's permission enforcement. The extension defaults to full access for all browser tools, with cookies and storage remaining gated behind their explicit toggles. Confirmation prompts for `evaluateScript` and `sendCdpCommand` are retained.

## Rationale

- The `observe` mode is too restrictive to be practically useful (blocks console, network, debugger entirely)
- The `debug` vs `control` distinction is subtle (only affects confirmation prompts for `evaluateScript` and `sendCdpCommand`)
- Simplifies the UI and reduces confusion for developers
- Confirmation prompts for `evaluateScript` and `sendCdpCommand` are retained as the only guardrails

## Changes

### 1. Chrome Extension — Remove UI Element

**`chrome-extension/sidepanel.html`**
- Remove `<select id="mode">...</select>` element

**`chrome-extension/sidepanel.js`**
- Remove `els.mode` from the DOM element map
- Remove `els.mode.value = state.permissionMode` from `render()`
- Remove `els.mode.addEventListener('change', ...)` listener
- Remove `${state.permissionMode}` from status text → just show `"Bridge online"` or `"Bridge offline"`

**`chrome-extension/sidepanel-state.js`**
- Remove `permissionMode` from `createInitialState()`
- Remove `permissionMode` handling from `session_state` reducer case
- Remove any test assertions referencing `permissionMode`

### 2. Protocol — Remove Permission Mode Types

**`src/protocol/permissions.ts`**
- Delete entire file (exports `permissionModes`, `PermissionMode`, `isPermissionMode` — none needed)

**`src/protocol/messages.ts`**
- Remove `{ type: 'set_permission_mode'; mode: PermissionMode }` from `ClientCommand` union
- Remove `case 'set_permission_mode'` from `isClientCommand()`
- Remove `import { isPermissionMode, type PermissionMode }` (no longer needed)

**`src/protocol/sessions.ts`**
- Remove `permissionMode: PermissionMode` from `SessionStartOptions`
- Remove `permissionMode: PermissionMode` from `SessionState`

**`src/protocol/index.ts`**
- Remove `export * from './permissions.js'`

### 3. Bridge — Simplify Permission Enforcement

**`src/bridge/permissions.ts`**
- Simplify `evaluateBrowserToolPermission()` to only check cookie/storage toggles and confirmation gates:
  ```ts
  if (tool.startsWith('cookies.') && !session.cookieAccessEnabled) return { allowed: false, reason: 'Cookie access is disabled' };
  if (tool.startsWith('storage.') && !session.storageAccessEnabled) return { allowed: false, reason: 'Storage access is disabled' };
  if (tool === 'debugger.evaluateScript') return { allowed: false, requiresConfirmation: true, reason: 'Script evaluation requires confirmation' };
  if (tool === 'debugger.sendCdpCommand') return { allowed: false, requiresConfirmation: true, reason: 'Raw CDP command requires confirmation' };
  return { allowed: true };
  ```
- Remove `debugReadTools` set (no longer needed)
- Remove `PermissionMode` import

**`src/bridge/session-registry.ts`**
- Remove `permissionMode` from `CreateSessionOptions` and `SessionRegistry` interface
- Remove `setPermissionMode()` method
- Remove `permissionMode` from session state initialization

**`src/bridge/start-context.ts`**
- Remove `permissionMode` from `BridgeStartContext` interface
- Remove `permissionMode` parsing from `parseStartContext()`
- Remove `PermissionMode` import

**`src/bridge/server.ts`**
- Remove `case 'set_permission_mode'` handler
- Remove `permissionMode` from default session fallback object
- Remove `PermissionMode` import

### 4. Pi Extension — Remove Permission Mode from Start Context

**`src/pi-extension/launcher.ts`**
- Remove `defaultPermissionMode` from `createPiWebUiController()` deps
- Remove `permissionMode: defaultPermissionMode` from `bridge.start()` call
- Remove `PermissionMode` import

**`src/pi-extension/bridge-process.ts`**
- Remove `permissionMode` from `BridgeStartOptions` (inherited from `SessionStartOptions`)
- No code changes needed if `SessionStartOptions` no longer has it

### 5. Tests — Update All References

Strip `permissionMode` from every test fixture and remove mode-specific test cases.

| File | Change |
|------|--------|
| `src/protocol/test/messages.test.ts` | Remove `set_permission_mode` test case |
| `src/bridge/test/permissions.test.ts` | Remove `observe` mode test, remove `permissionMode` from session fixtures |
| `src/bridge/test/permissions-confirmation.test.ts` | Remove `permissionMode` from session fixtures |
| `src/bridge/test/session-registry.test.ts` | Remove `permissionMode` from fixtures, remove `setPermissionMode` test |
| `src/bridge/test/server.test.ts` | Remove `set_permission_mode` handler test, remove `permissionMode` from fixtures |
| `src/bridge/test/start-context.test.ts` | Remove `permissionMode` from expected context |
| `src/bridge/test/browser-tools.test.ts` | Remove `permissionMode` from session fixtures |
| `src/bridge/test/websocket-server.test.ts` | Remove `set_permission_mode` WebSocket test, remove `permissionMode` from fixtures |
| `src/bridge/test/sdk-session-integration.test.ts` | Remove `permissionMode` from context fixtures |
| `src/bridge/test/prompt-relay.test.ts` | Remove `permissionMode` from context fixtures |
| `src/bridge/test/ui-response-command.test.ts` | Remove `permissionMode` from context fixtures |
| `src/bridge/test/server-sdk.test.ts` | Remove `permissionMode` from context fixtures |
| `src/pi-extension/test/bridge-process.test.ts` | Remove `permissionMode` from start options |
| `src/pi-extension/test/launcher.test.ts` | Remove `permissionMode` from expected bridge start call |
| `chrome-extension/test/sidepanel-state.test.js` | Remove `permissionMode` from initial state assertions and `session_state` tests |
| `chrome-extension/test/bridge-client.test.js` | Remove `permissionMode` from session state test fixtures |

## Files Deleted

- `src/protocol/permissions.ts`

## Files Modified (Summary)

| Layer | File | Change |
|-------|------|--------|
| Chrome UI | `sidepanel.html` | Remove `<select id="mode">` |
| Chrome UI | `sidepanel.js` | Remove mode element wiring |
| Chrome state | `sidepanel-state.js` | Remove `permissionMode` from state/reducer |
| Protocol | `protocol/index.ts` | Remove permissions export |
| Protocol | `protocol/messages.ts` | Remove `set_permission_mode` command |
| Protocol | `protocol/sessions.ts` | Remove `permissionMode` from types |
| Bridge | `bridge/permissions.ts` | Simplify to cookie/storage/confirmation only |
| Bridge | `bridge/session-registry.ts` | Remove `permissionMode` and `setPermissionMode` |
| Bridge | `bridge/start-context.ts` | Remove `permissionMode` from context |
| Bridge | `bridge/server.ts` | Remove `set_permission_mode` handler |
| Pi extension | `pi-extension/launcher.ts` | Remove `defaultPermissionMode` dep |
| Tests | 16 test files | Remove `permissionMode` from fixtures and assertions |

## Trade-offs

| Aspect | Before | After |
|--------|--------|-------|
| UI complexity | Mode selector + 3 modes | No mode selector |
| Permission enforcement | Mode-based + cookie/storage toggles + confirmations | Cookie/storage toggles + confirmations only |
| Guardrails for `evaluateScript`/`sendCdpCommand` | Confirmation in `debug`, none in `control` | Always requires confirmation |
| `observe` mode | Blocks most tools | Removed |
| Test surface | Mode-based permission tests | Simpler toggle/confirmation tests |

## Non-Goals

- Removing the cookie/storage toggles (these remain as meaningful gates)
- Removing confirmation prompts for `evaluateScript` and `sendCdpCommand`
- Removing the audit log infrastructure (can be addressed separately)
