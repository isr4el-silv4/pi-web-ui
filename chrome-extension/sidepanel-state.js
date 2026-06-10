export function createInitialState() {
  return {
    bridgeOnline: false,
    permissionMode: 'debug',
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
  };
}

export function reduceSidePanelState(state, event) {
  console.log('[SidePanel] Event:', event.type, event);
  switch (event.type) {
    case 'bridge_connected':
      return { ...state, bridgeOnline: true, sendError: null };
    case 'bridge_disconnected':
      return { ...state, bridgeOnline: false };
    case 'session_state':
      return {
        ...state,
        bridgeOnline: true,
        session: event.session,
        permissionMode: event.session?.permissionMode ?? state.permissionMode,
        cookieAccessEnabled: event.session?.cookieAccessEnabled ?? state.cookieAccessEnabled,
        storageAccessEnabled: event.session?.storageAccessEnabled ?? state.storageAccessEnabled,
      };
    case 'user_message':
      return { ...state, messages: [...state.messages, { role: 'user', text: event.text }], sending: true, sendError: null };
    case 'assistant_message':
      return { ...state, messages: [...state.messages, { role: 'assistant', text: event.text }], sending: false, sendError: null };
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
    default:
      return state;
  }
}
