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
  };
}

export function reduceSidePanelState(state, event) {
  switch (event.type) {
    case 'bridge_connected':
      return { ...state, bridgeOnline: true };
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
      return { ...state, messages: [...state.messages, { role: 'user', text: event.text }] };
    case 'assistant_message':
      return { ...state, messages: [...state.messages, { role: 'assistant', text: event.text }] };
    case 'prompt_received':
      // Acknowledgement that bridge received the prompt — no UI update needed
      // since the user message was already added locally
      return state;
    case 'extension_ui_request':
      return { ...state, uiRequests: [...state.uiRequests, { id: event.id, kind: event.kind, message: event.message, options: event.options }] };
    case 'extension_ui_notify':
      return { ...state, notifications: [...state.notifications, event.message] };
    case 'extension_ui_response_sent':
      return { ...state, uiRequests: state.uiRequests.filter((request) => request.id !== event.id) };
    default:
      return state;
  }
}
