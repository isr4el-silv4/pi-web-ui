export function createInitialState() {
  return {
    bridgeOnline: false,
    cookieAccessEnabled: false,
    storageAccessEnabled: false,
    messages: [],
    uiRequests: [],
    notifications: [],
    session: undefined,
    sending: false,
    sendError: null,
    devtoolsConflict: false,
    attachedTabs: [],
    sessionsList: [],
    loadingSessions: false,
    sessionError: null,
    reconnectExhausted: false,
  };
}

export function reduceSidePanelState(state, event) {
  console.log('[SidePanel] Event:', event.type, event);
  switch (event.type) {
    case 'bridge_connected':
      return { ...state, bridgeOnline: true, sendError: null, notifications: [] };
    case 'bridge_disconnected':
      return { ...state, bridgeOnline: false };
    case 'session_state':
      return {
        ...state,
        bridgeOnline: true,
        session: event.session,
        cookieAccessEnabled: event.session?.cookieAccessEnabled ?? state.cookieAccessEnabled,
        storageAccessEnabled: event.session?.storageAccessEnabled ?? state.storageAccessEnabled,
      };
    case 'user_message':
      return { ...state, messages: [...state.messages, { role: 'user', text: event.text }], sending: true, sendError: null };
    case 'assistant_message':
      return { ...state, messages: [...state.messages, { role: 'assistant', text: event.text, thinking: event.thinking }], sending: false, sendError: null };
    case 'tool_call':
      return { ...state, messages: [...state.messages, { role: 'tool', toolName: event.name, toolResult: '(running...)', isError: false }] };
    case 'tool_result': {
      const msgs = [...state.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === 'tool') {
        const last = msgs[lastIdx];
        const result = typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2);
        msgs[lastIdx] = { ...last, toolResult: result };
      }
      return { ...state, messages: msgs };
    }
    case 'prompt_sent':
      // Confirmed prompt reached the model
      return { ...state, sendError: null };
    case 'prompt_error':
      return { ...state, sending: false, sendError: event.error };
    case 'prompt_received':
      // Acknowledgement that bridge received the prompt — no UI update needed
      return state;
    case 'bridge_error':
      return { ...state, notifications: [...state.notifications, `Connection error: ${event.error}`] };
    case 'error':
      // Generic error from bridge server
      return { ...state, notifications: [...state.notifications, `Error: ${event.error}`], sending: false };
    case 'extension_ui_request':
      return { ...state, uiRequests: [...state.uiRequests, { id: event.id, kind: event.kind, message: event.message, options: event.options }] };
    case 'extension_ui_notify':
      return { ...state, notifications: [...state.notifications, event.message] };
    case 'extension_ui_response_sent':
      return { ...state, uiRequests: state.uiRequests.filter((request) => request.id !== event.id) };
    case 'devtools_conflict':
      return { ...state, devtoolsConflict: true };
    case 'devtools_conflict_resolved':
      return { ...state, devtoolsConflict: false };
    case 'debugger_attached':
      return {
        ...state,
        attachedTabs: state.attachedTabs.some((t) => t.id === event.tabId)
          ? state.attachedTabs
          : [...state.attachedTabs, { id: event.tabId, title: event.title }],
      };
    case 'debugger_detached':
      return {
        ...state,
        attachedTabs: state.attachedTabs.filter((t) => t.id !== event.tabId),
      };
    case 'loading_sessions':
      return { ...state, loadingSessions: true, sessionError: null };
    case 'sessions_loaded':
      return { ...state, sessionsList: event.sessions, loadingSessions: false, sessionError: null };
    case 'sessions_list':
      return { ...state, sessionsList: event.sessions, loadingSessions: false, sessionError: null };
    case 'session_error':
      return { ...state, sessionError: event.error, loadingSessions: false };
    case 'session_history':
      // Clear existing messages and replace with history
      // Also update cwd from the session file if provided
      return { 
        ...state, 
        messages: event.messages, 
        sending: false,
        sessionError: null,
        ...(event.cwd ? { session: { ...state.session, cwd: event.cwd } } : {}),
      };
    case 'bridge_reconnect_exhausted':
      return { ...state, reconnectExhausted: true, bridgeOnline: false };
    case 'abort_sent':
      // Optimistic: user clicked abort — show "Aborted" message, clear sending state
      return {
        ...state,
        sending: false,
        sendError: null,
        messages: [...state.messages, { role: 'system', text: '⚠ Aborted' }],
      };
    case 'thinking':
      // Model is thinking — append/update thinking indicator
      {
        const msgs = [...state.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant' && msgs[lastIdx].thinking !== undefined) {
          // Update existing thinking message
          msgs[lastIdx] = { ...msgs[lastIdx], thinking: msgs[lastIdx].thinking + (event.text || '') };
        } else {
          // Append new thinking message
          msgs.push({ role: 'assistant', text: '', thinking: event.text || '' });
        }
        return { ...state, messages: msgs };
      }
    case 'abort_received':
      // Server confirmed abort — no additional UI change needed
      return state;
    default:
      return state;
  }
}
