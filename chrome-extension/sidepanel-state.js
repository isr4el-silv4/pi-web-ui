export function createInitialState() {
  return {
    bridgeOnline: false,
    permissionMode: 'debug',
    cookieAccessEnabled: false,
    storageAccessEnabled: false,
    messages: [],
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
    case 'prompt_received':
      return { ...state, messages: [...state.messages, { role: 'assistant', text: event.text ?? event.message }] };
    default:
      return state;
  }
}
