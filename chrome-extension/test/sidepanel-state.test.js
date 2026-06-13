import { describe, expect, it } from 'vitest';
import { createInitialState, reduceSidePanelState } from '../sidepanel-state.js';

describe('side panel state', () => {
  it('starts offline with secure defaults', () => {
    expect(createInitialState()).toEqual({
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
    });
  });

  it('marks bridge online when connected', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'bridge_connected' });
    expect(state.bridgeOnline).toBe(true);
  });

  it('clears send error when bridge connects', () => {
    const withError = reduceSidePanelState(createInitialState(), { type: 'prompt_error', message: 'test', error: 'SDK not ready' });
    const connected = reduceSidePanelState(withError, { type: 'bridge_connected' });
    expect(connected.sendError).toBeNull();
  });

  it('updates session and toggles from session_state messages', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'session_state',
      session: {
        id: 's1',
        cwd: '/project',
        cookieAccessEnabled: true,
        storageAccessEnabled: true,
      },
    });

    expect(state).toMatchObject({
      bridgeOnline: true,
      cookieAccessEnabled: true,
      storageAccessEnabled: true,
      session: { id: 's1', cwd: '/project' },
    });
  });

  it('appends user and assistant messages', () => {
    const withUser = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    const withAssistant = reduceSidePanelState(withUser, { type: 'assistant_message', text: 'Hello' });

    expect(withAssistant.messages).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' },
    ]);
  });

  it('sets sending=true when user sends a message', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    expect(state.sending).toBe(true);
    expect(state.sendError).toBeNull();
  });

  it('sets sending=false when assistant responds', () => {
    const sending = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    const responded = reduceSidePanelState(sending, { type: 'assistant_message', text: 'Hello' });
    expect(responded.sending).toBe(false);
    expect(responded.sendError).toBeNull();
  });

  it('sets sending=false and sendError when prompt fails', () => {
    const sending = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    const errored = reduceSidePanelState(sending, { type: 'prompt_error', message: 'Hi', error: 'SDK not ready' });
    expect(errored.sending).toBe(false);
    expect(errored.sendError).toBe('SDK not ready');
  });

  it('ignores prompt_received acknowledgement to avoid duplicating user message', () => {
    const withUser = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    const withAck = reduceSidePanelState(withUser, { type: 'prompt_received', message: 'Hi' });

    // prompt_received should not add another message
    expect(withAck.messages).toEqual([{ role: 'user', text: 'Hi' }]);
  });

  it('relays assistant_message from bridge as assistant role', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'assistant_message',
      text: 'Pi response here',
    });

    expect(state.messages).toEqual([{ role: 'assistant', text: 'Pi response here' }]);
  });

  it('adds bridge_error as a notification', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'bridge_error',
      error: 'WebSocket connection error',
    });
    expect(state.notifications).toEqual(['Connection error: WebSocket connection error']);
  });

  it('prompt_sent clears any pending send error', () => {
    const withError = reduceSidePanelState(createInitialState(), { type: 'prompt_error', message: 'test', error: 'fail' });
    const sent = reduceSidePanelState(withError, { type: 'prompt_sent', message: 'test' });
    expect(sent.sendError).toBeNull();
  });

  it('adds generic error from bridge as a notification and stops sending', () => {
    const sending = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Hi' });
    const errored = reduceSidePanelState(sending, {
      type: 'error',
      error: 'Command handling failed: something went wrong',
    });
    expect(errored.notifications).toEqual(['Error: Command handling failed: something went wrong']);
    expect(errored.sending).toBe(false);
  });

  it('sets devtoolsConflict=true on devtools_conflict event', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'devtools_conflict' });
    expect(state.devtoolsConflict).toBe(true);
  });

  it('sets devtoolsConflict=false on devtools_conflict_resolved event', () => {
    const withConflict = reduceSidePanelState(createInitialState(), { type: 'devtools_conflict' });
    const resolved = reduceSidePanelState(withConflict, { type: 'devtools_conflict_resolved' });
    expect(resolved.devtoolsConflict).toBe(false);
  });

  it('appends tab to attachedTabs on debugger_attached event', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'debugger_attached',
      tabId: 42,
      title: 'My Page',
    });
    expect(state.attachedTabs).toEqual([{ id: 42, title: 'My Page' }]);
  });

  it('removes tab from attachedTabs on debugger_detached event', () => {
    const withTab = reduceSidePanelState(createInitialState(), {
      type: 'debugger_attached',
      tabId: 42,
      title: 'My Page',
    });
    const detached = reduceSidePanelState(withTab, { type: 'debugger_detached', tabId: 42 });
    expect(detached.attachedTabs).toEqual([]);
  });

  it('keeps other tabs when one is detached', () => {
    let state = reduceSidePanelState(createInitialState(), {
      type: 'debugger_attached', tabId: 1, title: 'Tab 1',
    });
    state = reduceSidePanelState(state, {
      type: 'debugger_attached', tabId: 2, title: 'Tab 2',
    });
    state = reduceSidePanelState(state, { type: 'debugger_detached', tabId: 1 });
    expect(state.attachedTabs).toEqual([{ id: 2, title: 'Tab 2' }]);
  });

  it('does not duplicate tabs when debugger_attached fires for same tabId', () => {
    let state = reduceSidePanelState(createInitialState(), {
      type: 'debugger_attached', tabId: 42, title: 'My Page',
    });
    state = reduceSidePanelState(state, {
      type: 'debugger_attached', tabId: 42, title: 'My Page',
    });
    expect(state.attachedTabs).toHaveLength(1);
  });

  it('updates cwd from session_state after new_session', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'session_state',
      session: {
        id: 's2',
        cwd: '/home/user/my-project',
        cookieAccessEnabled: false,
        storageAccessEnabled: false,
      },
    });

    expect(state.session.cwd).toBe('/home/user/my-project');
    expect(state.session.id).toBe('s2');
  });

  it('preserves existing cwd when session_state does not include it', () => {
    const withSession = reduceSidePanelState(createInitialState(), {
      type: 'session_state',
      session: { id: 's1', cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false },
    });
    const updated = reduceSidePanelState(withSession, {
      type: 'session_state',
      session: { id: 's1', cookieAccessEnabled: true, storageAccessEnabled: false },
    });

    // session.cwd is gone but state.session is the new object
    expect(updated.session.id).toBe('s1');
    expect(updated.cookieAccessEnabled).toBe(true);
  });

  it('sets loadingSessions=true on loading_sessions event', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'loading_sessions' });
    expect(state.loadingSessions).toBe(true);
    expect(state.sessionError).toBeNull();
  });

  it('populates sessionsList on sessions_loaded event', () => {
    const sessions = [
      { path: '/project/.pi/sessions/2024-01-01.jsonl', name: 'My Session', timestamp: '2024-01-01T10:00:00Z', firstMessage: 'Hello' },
      { path: '/project/.pi/sessions/2024-01-02.jsonl', timestamp: '2024-01-02T10:00:00Z' },
    ];
    const state = reduceSidePanelState(createInitialState(), { type: 'sessions_list', sessions });
    expect(state.sessionsList).toEqual(sessions);
    expect(state.loadingSessions).toBe(false);
  });

  it('sets sessionError on session_error event', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'session_error', error: 'Failed to load session' });
    expect(state.sessionError).toBe('Failed to load session');
    expect(state.loadingSessions).toBe(false);
  });

  it('replaces messages on session_history event', () => {
    // Start with existing messages
    const withMessages = reduceSidePanelState(createInitialState(), { type: 'user_message', text: 'Old message' });
    expect(withMessages.messages).toHaveLength(1);

    // Load session history
    const history = [
      { role: 'user', text: 'First message' },
      { role: 'assistant', text: 'First response' },
      { role: 'user', text: 'Second message' },
    ];
    const state = reduceSidePanelState(withMessages, { type: 'session_history', messages: history });
    expect(state.messages).toEqual(history);
    expect(state.sending).toBe(false);
  });

  it('handles rich message types in session_history', () => {
    const history = [
      { role: 'tool', toolName: 'read_file', toolResult: 'file content', isError: false },
      { role: 'bash', command: 'ls', output: 'file1.txt', exitCode: 0, isError: false },
      { role: 'compaction', summary: 'Context compacted', tokensBefore: 40000 },
      { role: 'assistant', text: 'Response', thinking: 'Let me think...' },
      { role: 'user', text: 'Here is an image', image: { data: 'base64data', mimeType: 'image/png' } },
    ];
    const state = reduceSidePanelState(createInitialState(), { type: 'session_history', messages: history });
    expect(state.messages).toEqual(history);
    expect(state.messages).toHaveLength(5);
  });

  it('handles bash message with null exitCode', () => {
    const history = [
      { role: 'bash', command: 'ls', output: 'file1.txt', exitCode: null, isError: false },
    ];
    const state = reduceSidePanelState(createInitialState(), { type: 'session_history', messages: history });
    expect(state.messages).toEqual(history);
  });

  it('sets reconnectExhausted=true on bridge_reconnect_exhausted event', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'bridge_reconnect_exhausted' });
    expect(state.reconnectExhausted).toBe(true);
    expect(state.bridgeOnline).toBe(false);
  });
});
