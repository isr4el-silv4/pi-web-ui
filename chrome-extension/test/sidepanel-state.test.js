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
      session: undefined,
    });
  });

  it('marks bridge online when connected', () => {
    const state = reduceSidePanelState(createInitialState(), { type: 'bridge_connected' });
    expect(state.bridgeOnline).toBe(true);
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
});
