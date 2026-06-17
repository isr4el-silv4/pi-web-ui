<div align="center">
  <img src="https://i.imgur.com/kRzvtpk.webp" alt="pi-web-ui screenshot" style="max-width:800px;">
</div>

# pi-web-ui

**A local bridge that gives Pi Coding Agent direct browser control — so you can work in your terminal and your browser without ever breaking context.**

[![npm version](https://img.shields.io/npm/v/pi-web-ui.svg)](https://www.npmjs.com/package/pi-web-ui)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## 💡 Philosophy

**Your session shouldn't be confined to one tool.** When you're debugging a frontend issue, you switch between your terminal (where Pi lives) and your browser (where the problem is). Every switch costs context. Every copy-paste loses nuance.

pi-web-ui eliminates that friction by turning your Chrome browser into a first-class tool for Pi. The bridge runs **entirely on your machine** — no data leaves to a third-party server — and enforces permissions so sensitive operations (cookie access, script evaluation, raw CDP commands) require your explicit approval.

Core principles:

- **Local-first privacy** — The bridge is a local WebSocket/HTTP server on `127.0.0.1`. All communication stays on your machine.
- **Seamless terminal ↔ browser sessions** — Start a session from Pi's terminal, continue it in the Chrome side panel, resume it hours later. One conversation, multiple surfaces.
- **Permission-aware by default** — Cookie and storage access are opt-in. Script evaluation and raw CDP commands require confirmation. All sensitive actions are audit-logged.
- **Browser as a tool, not a toy** — Pi gets structured access to page content, network requests, console logs, screenshots, and the full Chrome DevTools Protocol.

---

## 🔌 What It Does

pi-web-ui is the **server-side bridge** that connects three pieces:

| Component | Role |
|---|---|
| **Pi Coding Agent** | Sends prompts, receives responses, requests browser tools |
| **pi-web-ui (this package)** | Local bridge — manages sessions, enforces permissions, relays messages |
| **Chrome Extension** | Side panel UI + executes browser operations via Chrome DevTools Protocol |

```
┌───────────────────────────┐         WebSocket          ┌──────────────────────┐
│   Chrome Extension        │ ◄──── ws://127.0.0.1 ───►  │   Local Bridge       │
│   (side panel UI)         │         (port 43117)       │  (pi-web-ui)         │
│                           │                            │                      │
│  • Debugger client        │   browser_tool_request     │  • Pi SDK session    │
│  • Network capture        │ ◄───────────────────────── │  • Tool executor     │
│  • Console capture        │   browser_tool_response    │  • Permission gates  │
│  • Session management     │                            │  • Session registry  │
└───────────────────────────┘                            └──────────────────────┘
         ▲                                                ▲
         │                                                │
   Chrome tabs ◄──────── Chrome DevTools Protocol ────── Pi Coding Agent
```

---

## 📋 Prerequisites

- **Node.js** ≥ 18 (ESM modules, `fetch` built-in)
- **Pi Coding Agent** ([pi.dev](https://pi.dev))
- **Chrome Extension** — [coming soon to the Chrome Web Store](https://chromewebstore.google.com/)
- **Google Chrome** (or any Chromium-based browser)

---

## 📦 Installation

```bash
npm install pi-web-ui
```

### Chrome Extension Setup

**From the Chrome Web Store:** Coming soon — [link TBD](https://chromewebstore.google.com/).

**Manual (development):** Until the extension is published, load it from source:

1. Clone the [Chrome extension repository](https://github.com/isr4el-silv4/pi-web-ui-chrome-extension).
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the extension directory.
5. Click the Pi Web UI extension icon (or right-click → "Add to toolbar") to pin it.

---

## 🚀 Quick Start

### 1. Start the Bridge

From a Pi terminal session, run:

```
/pi-web-ui start
```

This spawns the local bridge on port `43117` and opens Chrome with the side panel.

### 2. Open the Side Panel

Click the Pi Web UI extension icon in Chrome. The side panel should show **Bridge online** when connected.

### 3. Pick Your Working Directory

Click **Browse…** in the side panel header to select your project directory. This sets the `cwd` for the Pi session and determines where session files are saved.

### 4. Start Working

Send a prompt from either:

- **Pi's terminal** — type your message as usual.
- **The Chrome side panel** — use the chat input in the extension.

Pi responds in both places, and the conversation stays synchronized.

---

## ⌨️ Usage

### CLI Commands

The `pi-web-ui` binary provides lifecycle management:

| Command | Description | Example |
|---|---|---|
| `start` | Start the bridge and open Chrome | `/pi-web-ui start` |
| `stop` | Stop the running bridge | `/pi-web-ui stop` |
| `status` | Check if the bridge is running | `/pi-web-ui status` |
| `open` | Open Chrome with the side panel (bridge must be running) | `/pi-web-ui open` |

---

## 🛠️ Browser Tools

Pi gains access to these browser operations on your active tabs:

### Page Inspection

| Tool | Description |
|---|---|
| `browser_get_page_text` | Get the visible text content of the current page |
| `browser_get_page_html` | Get the full HTML of the current page |
| `browser_get_selection` | Get the currently selected/highlighted text |
| `browser_capture_screenshot` | Capture a screenshot of the current tab |

**Example — Ask Pi to inspect a page:**

> "What does the current page say about the error message?"

Pi calls `browser_get_page_text`, reads the content, and responds with an analysis.

### Tab Management

| Tool | Description |
|---|---|
| `browser_list_tabs` | List all open browser tabs |
| `browser_get_current_tab` | Get info about the active tab (including debugger attachment status) |

**Example — Switch context:**

> "List my open tabs and summarize what each one is about."

### Console & Network Debugging

| Tool | Description |
|---|---|
| `browser_get_console_logs` | Get buffered console logs from the browser |
| `browser_clear_console_log_buffer` | Clear the console log buffer |
| `browser_start_network_capture` | Start capturing network requests |
| `browser_stop_network_capture` | Stop network capture |
| `browser_get_network_requests` | Get all captured network requests |
| `browser_get_network_request` | Get details for a specific request by ID |
| `browser_get_network_response_body` | Get the response body of a specific request |

**Example — Debug a failing API call:**

> "Check the network requests for any failures and show me the error response."

Pi attaches the debugger, captures network traffic, filters for errors, and shows you the response — all without you touching DevTools.

**Example — Console errors:**

> "Are there any errors in the browser console?"

### Debugger & Script Evaluation

| Tool | Description | Requires Confirmation |
|---|---|---|
| `browser_attach_debugger` | Attach Chrome debugger to a tab | No |
| `browser_detach_debugger` | Detach debugger from a tab | No |
| `browser_get_attached_tabs` | List tabs with debugger attached | No |
| `browser_evaluate_script` | Execute JavaScript in the page context | **Yes** |
| `browser_send_cdp_command` | Send raw Chrome DevTools Protocol commands | **Yes** |

**Example — Evaluate a selector:**

> "Run `document.querySelectorAll('.card').length` in the current tab and tell me how many cards there are."

A confirmation prompt appears in the side panel. Approve it, and Pi executes the script and reports the result.

### Cookies & Storage (Opt-In)

| Tool | Description | Permission |
|---|---|---|
| `browser_get_cookies` | Get cookies for the current page or domain | Header toggle |
| `browser_get_local_storage` | Get localStorage entries | Header toggle |
| `browser_get_session_storage` | Get sessionStorage entries | Header toggle |

Enable these via the **Cookie access** and **Storage access** checkboxes in the side panel header. They are **disabled by default**.

---

## 🎨 Frontend Development Workflows

Here are common scenarios where pi-web-ui saves time:

### Debug a Visual Bug

1. Open the page with the bug in Chrome.
2. Ask Pi: *"Take a screenshot of the current tab and tell me what's wrong with the layout."*
3. Pi captures the screenshot, analyzes it, and suggests fixes.
4. Apply fixes in your editor, refresh, and ask Pi to verify.

### Investigate a Network Error

1. Reproduce the error in your browser.
2. Ask Pi: *"Check the network requests for any failures and show me the error response."*
3. Pi reads the captured requests, identifies the failing call, and shows you the response body and status code.

### Audit Console Output

1. Ask Pi: *"Read the browser console — are there any warnings or errors?"*
2. Pi fetches console logs, filters by severity, and summarizes findings.

### Cross-Reference Page State with Code

1. Ask Pi: *"Get the HTML of the current page and compare it with `src/App.tsx` — are there any mismatches?"*
2. Pi reads the live DOM, reads your source file, and highlights discrepancies.

---

## 📂 Session Management

Sessions are tied to your **working directory** and persisted as JSONL files.

- **New session** — Click **+ New Session** in the side panel, or run `/pi-web-ui start` in a new directory.
- **Resume session** — Pick a previous session from the dropdown to continue where you left off.
- **Switch surfaces** — Start a conversation in Pi's terminal, continue it in the Chrome side panel. History is synchronized.
- **Session history** — When resuming, the full conversation (including tool calls and results) is loaded and displayed.

---

## 🔒 Permissions & Safety

| Operation | Default | Control |
|---|---|---|
| Page inspection (text, HTML, screenshot) | Allowed | Always |
| Tab management | Allowed | Always |
| Console logs | Allowed | Always |
| Network capture | Allowed | Always |
| Cookie access | **Disabled** | Header toggle |
| Storage access | **Disabled** | Header toggle |
| Script evaluation | **Requires confirmation** | Per-request prompt |
| Raw CDP commands | **Requires confirmation** | Per-request prompt |

All confirmed sensitive actions are recorded in an **audit log** on the bridge side, so you can review what was executed and when.

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE) for details.
