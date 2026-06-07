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
});
