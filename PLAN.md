# pi-web-ui PLAN

## Goal

Build `pi-web-ui`: a cohesive Pi extension package that provides a Chrome side-panel UI for Pi, backed by a local Node bridge runtime and a Chrome MV3 extension. Browser Pi must preserve the same Pi ecosystem available in terminal Pi while adding first-class browser/Chrome DevTools tools.

## Definition of Done

`pi-web-ui` is complete when:

1. It ships as one cohesive project under `~/.pi/agent/extensions/pi-web-ui` containing:
   - Pi extension launcher/control commands
   - local Node bridge runtime
   - Chrome MV3 extension
   - shared protocol/types

2. Terminal flow works:
   ```text
   /pi-web-ui start
   ```
   from an existing terminal Pi session starts/focuses the browser UI using:
   - same cwd
   - same current/resumable session metadata
   - default Chrome profile
   - Debug permission mode
   - cookies/storage disabled by default

3. Browser flow works:
   - clicking the Chrome extension button opens the side panel
   - if bridge is offline, it shows instructions to start `/pi-web-ui start`
   - if bridge is online, user can:
     - start a new Pi session
     - choose cwd
     - resume an existing session

4. Browser Pi loads the same Pi ecosystem as terminal Pi:
   - global/project Pi extensions
   - skills
   - prompt templates
   - settings
   - models/auth
   - existing tool interceptors/guards/custom tools

5. Browser tools are available as first-class Pi tools via the bridge:
   - console logs
   - network requests
   - network response bodies
   - current page HTML/text/selection
   - screenshots
   - raw CDP command tool
   - guarded JS evaluation

6. Chrome extension executes browser operations via:
   - `chrome.debugger`
   - `chrome.tabs`
   - `chrome.scripting`
   - `chrome.cookies`, behind explicit toggle
   - storage access, behind explicit toggle

7. Extension UI requests from Pi are rendered in the browser side panel where possible:
   - confirm
   - select
   - input
   - editor
   - notify/status/widget

8. Security model:
   - default mode: Debug
   - cookies/storage disabled until explicit toggle
   - no destructive browser mutation without confirmation
   - raw CDP actions are logged/auditable

## Architecture

`pi-web-ui` is one product with three runtime contexts:

```text
pi-web-ui
  ├─ Pi extension runtime
  │    /pi-web-ui start|stop|status|open
  │
  ├─ Local Node bridge runtime
  │    hosts Pi SDK sessions
  │    loads normal Pi resources/extensions
  │    registers browser tools
  │    relays events/UI/tool calls
  │
  └─ Chrome extension runtime
       side panel chat UI
       chrome.debugger executor
       network/console/cookie/storage collectors
```

The bridge is part of `pi-web-ui`, not an unrelated external integration. The Pi extension controls and launches it. The bridge hosts SDK sessions and browser tool definitions. The Chrome extension executes browser operations using Chrome APIs.

### Why multiple runtimes are required

- Chrome extensions cannot spawn Node processes or import the Pi SDK directly.
- Pi extensions cannot directly access `chrome.debugger` or Chrome extension APIs.
- The local bridge must mediate between Pi SDK tools and Chrome extension APIs.

## Project Layout

```text
~/.pi/agent/extensions/pi-web-ui/
  PLAN.md
  package.json
  tsconfig.json
  README.md

  src/
    pi-extension/
      index.ts
      launcher.ts
      chrome.ts
      bridge-process.ts

    bridge/
      server.ts
      sdk-session.ts
      session-registry.ts
      browser-tools.ts
      browser-client.ts
      extension-ui-adapter.ts
      permissions.ts
      protocol-router.ts

    protocol/
      index.ts
      messages.ts
      browser-tools.ts
      permissions.ts
      sessions.ts

  chrome-extension/
    manifest.json
    background.js
    sidepanel.html
    sidepanel.js
    sidepanel.css
    debugger-client.js
    network-capture.js
    console-capture.js
    cookies-client.js
    storage-client.js
```

TypeScript should be used for Pi extension, bridge, and shared protocol. Chrome extension can initially be plain JS for simplicity, or built from TS later.

## Responsibility Split

### Pi extension

Owns terminal integration and launcher commands.

Commands:

```text
/pi-web-ui start
/pi-web-ui stop
/pi-web-ui status
/pi-web-ui open
```

Responsibilities:

- detect current cwd
- detect current session metadata where possible
- start local bridge runtime
- pass cwd/session/mode/cookie defaults to bridge
- open/focus Chrome default profile
- provide status notifications in terminal Pi
- avoid implementing browser DevTools logic directly

### Bridge runtime

Owns Pi SDK session hosting and first-class Pi browser tools.

Responsibilities:

- use `@earendil-works/pi-coding-agent` SDK
- create/resume/switch Pi sessions
- load normal Pi resources using `DefaultResourceLoader`
- preserve global/project extension discovery behavior
- register browser tools as SDK custom tools
- relay browser tool calls to Chrome extension
- relay Pi events to side panel
- render/relay extension UI requests to side panel
- enforce permission model

### Chrome extension

Owns browser UI and Chrome API execution.

Responsibilities:

- display side panel chat UI
- connect to local bridge via WebSocket
- execute browser tool requests using Chrome APIs
- capture console/network events through `chrome.debugger`
- implement cookies/storage access only when enabled
- show bridge/session status
- expose Debug mode and cookies/storage toggle

## Browser Tool Model

Browser tools are **defined in the bridge** as Pi SDK custom tools and **executed by the Chrome extension**.

Example flow:

```text
Pi model calls browser_get_console_logs
  ↓
Bridge tool implementation receives tool call
  ↓
Bridge sends browser_tool_request over WebSocket
  ↓
Chrome extension uses chrome.debugger / Chrome APIs
  ↓
Chrome extension returns browser_tool_response
  ↓
Bridge returns normal Pi tool result
  ↓
Pi reasons over result and responds
```

Chrome provides raw APIs. `pi-web-ui` turns them into Pi tools.

## Initial Browser Tools

### Tab/Page

- `browser_list_tabs`
- `browser_get_current_tab`
- `browser_select_tab`
- `browser_get_page_html`
- `browser_get_page_text`
- `browser_get_selection`
- `browser_capture_screenshot`

### Console

- `browser_get_console_logs`
- `browser_clear_console_log_buffer`

### Network

- `browser_start_network_capture`
- `browser_stop_network_capture`
- `browser_get_network_requests`
- `browser_get_network_request`
- `browser_get_network_response_body`

### Debugger/CDP

- `browser_attach_debugger`
- `browser_detach_debugger`
- `browser_send_cdp_command`
- `browser_evaluate_script`

### Cookies/Storage

Disabled by default; require explicit browser UI toggle.

- `browser_get_cookies`
- `browser_get_local_storage`
- `browser_get_session_storage`

Write/delete cookie/storage operations should require explicit per-action confirmation even if the read toggle is enabled.

### Permissions/Status

- `browser_get_permission_mode`
- `browser_set_permission_mode`
- `browser_get_bridge_status`

## Permission Modes

Default mode: `debug`.

### observe

Allowed:

- current tab metadata
- page text/selection
- page HTML if enabled
- screenshots
- console/network summaries

Blocked or requires confirmation:

- JS evaluation
- raw CDP command
- navigation
- page mutation
- cookies/storage

### debug

Allowed:

- console logs
- network requests
- response bodies
- HTML/text/selection
- screenshots
- attach/detach debugger
- raw CDP for read-oriented domains with audit logging

Requires confirmation:

- arbitrary JS evaluation unless clearly read-only
- navigation
- DOM mutation
- storage/cookie mutation
- dangerous raw CDP methods

Cookies/storage reads remain disabled until explicit toggle.

### control

Allows broader page control but still requires confirmation for destructive or sensitive actions unless future settings explicitly disable prompts.

## Chrome Extension Permissions

Initial manifest permissions likely need:

```json
{
  "permissions": [
    "debugger",
    "tabs",
    "activeTab",
    "scripting",
    "cookies",
    "storage",
    "sidePanel",
    "webRequest"
  ],
  "host_permissions": ["<all_urls>"]
}
```

Security note: these are powerful permissions. The UI must make active mode and cookie/storage state clear.

## Protocol

Use WebSocket between bridge and Chrome extension.

### Browser tool request

```json
{
  "id": "req-123",
  "type": "browser_tool_request",
  "tool": "console.getLogs",
  "params": {
    "tabId": "active",
    "levels": ["error", "warning"]
  }
}
```

### Browser tool response

```json
{
  "id": "req-123",
  "type": "browser_tool_response",
  "success": true,
  "data": {
    "logs": []
  }
}
```

### Pi event stream to side panel

Bridge sends normalized Pi SDK events to the side panel, including:

- message start/update/end
- text deltas
- thinking deltas if enabled and display allowed
- tool execution start/update/end
- queue updates
- session state updates
- extension UI requests

### Client commands from side panel

Examples:

```json
{ "type": "prompt", "message": "Check console errors" }
{ "type": "abort" }
{ "type": "new_session", "cwd": "/path/to/project" }
{ "type": "resume_session", "sessionPath": "/path/to/session.jsonl" }
{ "type": "set_permission_mode", "mode": "debug" }
{ "type": "set_cookie_access", "enabled": true }
```

## Session Flows

### Flow A: terminal Pi to browser

User runs:

```text
/pi-web-ui start
```

Expected sequence:

1. Pi extension gets current cwd/session metadata.
2. Pi extension starts bridge if not already running.
3. Bridge initializes using provided cwd/session.
4. Pi extension opens Chrome default profile.
5. Chrome extension side panel connects to bridge.
6. Bridge creates/resumes SDK session.
7. Session loads normal Pi resources/extensions plus browser tools.

### Flow B: browser button to session chooser

User clicks Chrome extension button.

Expected sequence:

1. Side panel opens.
2. Side panel checks bridge connection.
3. If offline, show instructions:
   ```text
   Start Pi Web UI from terminal Pi with: /pi-web-ui start
   ```
4. If online, show actions:
   - continue recent
   - new session with cwd
   - resume existing session
5. Bridge creates/resumes session accordingly.

For v1, browser button does not start the bridge itself. Native Messaging can be a v2 enhancement.

## Extension UI Adapter

Pi extension UI requests should render in the side panel when possible:

- `confirm`
- `select`
- `input`
- `editor`
- `notify`
- `setStatus`
- `setWidget`
- `setTitle`
- `set_editor_text`

Full custom TUI components may not transfer directly and can be degraded or ignored with visible diagnostics.

## Implementation Phases

### Phase 1: skeleton/package setup

- create package metadata
- define source layout
- add shared protocol types
- add build scripts
- add minimal README

### Phase 2: Pi extension launcher

- implement `/pi-web-ui start`
- implement `/pi-web-ui status`
- implement bridge process spawning
- open Chrome default profile
- pass cwd/session/mode/cookie defaults

### Phase 3: bridge MVP

- WebSocket server
- Chrome client connection registry
- Pi SDK session creation
- event streaming to connected side panel
- prompt/abort/new-session/resume commands
- resource loading using normal Pi discovery behavior

### Phase 4: Chrome extension MVP

- MV3 manifest
- side panel UI
- background service worker
- WebSocket connection
- prompt input and streamed output
- bridge online/offline status
- Debug mode indicator
- cookie/storage toggle, default off

### Phase 5: browser tools MVP

Implement first batch:

- current tab
- page HTML/text/selection
- screenshots
- console capture
- network capture
- network response body
- raw CDP command
- guarded JS evaluation

### Phase 6: permission enforcement

- enforce observe/debug/control modes in bridge
- enforce cookie/storage toggle
- confirmation prompts for dangerous actions
- audit log for raw CDP and mutation actions

### Phase 7: extension UI adapter

- bridge maps Pi extension UI requests to side panel dialogs
- side panel sends responses back
- implement notify/status/widget display

### Phase 8: polish and testing

- manual test checklist
- sample debugging prompts
- failure recovery when Chrome disconnects
- bridge restart behavior
- session resume behavior
- clear errors for missing extension/permissions

## Key Risks

1. **Session continuation fidelity**
   - Continuing exactly the currently running terminal Pi session may require careful session metadata handling.
   - Practical v1 may resume the same session file/branch rather than literally sharing the live in-memory terminal runtime.

2. **Duplicate extension loading**
   - Browser Pi SDK session will load the same extensions independently.
   - Extensions with external singleton side effects need testing.

3. **Chrome debugger attachment behavior**
   - Attaching debugger can interfere with open DevTools or show Chrome warnings.
   - Need graceful attach/detach and visible state.

4. **Response body availability**
   - `Network.getResponseBody` only works for captured requests and may fail for some request types/timing.

5. **Sensitive data exposure**
   - Network/cookie/storage data may include secrets.
   - Keep cookies/storage off by default and make modes visible.

6. **Custom TUI extension components**
   - Browser side panel can support RPC-style UI methods, but not arbitrary terminal UI components without additional rendering infrastructure.

## v2 Ideas

- Chrome Native Messaging host so extension button can start bridge automatically.
- Always-on companion daemon.
- Multi-browser/multi-tab session routing.
- Browser replay timeline for network/console/tool calls.
- Import/export debugging bundle.
- Stronger policy engine for CDP domains/methods.
- Project-level configuration for default permission mode.

## Manual Test Checklist

- Run `/pi-web-ui start` from terminal Pi.
- Chrome opens/focuses default profile.
- Side panel connects to bridge.
- Ask Pi a normal coding question; verify existing tools/extensions work.
- Ask Pi to inspect current page console errors.
- Ask Pi to inspect recent network requests.
- Ask Pi to read a response body.
- Ask Pi to get current page HTML.
- Verify cookies are blocked before toggle.
- Enable cookies toggle and verify read access works.
- Attempt browser mutation and verify confirmation is required.
- Trigger an existing Pi extension confirmation/select/input UI and verify side panel displays it.
