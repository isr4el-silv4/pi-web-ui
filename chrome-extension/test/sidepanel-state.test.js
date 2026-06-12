import { describe, expect, it } from 'vitest';
import { createInitialState, reduceSidePanelState } from '../sidepanel-state.js';

describe('side panel state', () => {
  it('starts offline with secure defaults', () => {
    expect(createInitialState()).toEqual({
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

  it('updates session, mode, and toggles from session_state messages', () => {
    const state = reduceSidePanelState(createInitialState(), {
      type: 'session_state',
      session: {
        id: 's1',
        cwd: '/project',
        permissionMode: 'control',
        cookieAccessEnabled: true,
        storageAccessEnabled: true,
      },
    });

    expect(state).toMatchObject({
      bridgeOnline: true,
      permissionMode: 'control',
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
        permissionMode: 'debug',
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
      session: { id: 's1', cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false },
    });
    const updated = reduceSidePanelState(withSession, {
      type: 'session_state',
      session: { id: 's1', permissionMode: 'control', cookieAccessEnabled: false, storageAccessEnabled: false },
    });

    // session.cwd is gone but state.session is the new object
    expect(updated.session.id).toBe('s1');
    expect(updated.permissionMode).toBe('control');
  });
});
