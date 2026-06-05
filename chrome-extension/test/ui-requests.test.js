import { describe, expect, it } from 'vitest';
import { createInitialState, reduceSidePanelState } from '../sidepanel-state.js';

describe('side panel UI requests', () => {
  it('tracks extension UI requests and notifications', () => {
    let state = reduceSidePanelState(createInitialState(), { id: 'ui-1', type: 'extension_ui_request', kind: 'confirm', message: 'Proceed?' });
    expect(state.uiRequests).toEqual([{ id: 'ui-1', kind: 'confirm', message: 'Proceed?' }]);
    state = reduceSidePanelState(state, { type: 'extension_ui_notify', message: 'Done' });
    expect(state.notifications).toEqual(['Done']);
    state = reduceSidePanelState(state, { type: 'extension_ui_response_sent', id: 'ui-1' });
    expect(state.uiRequests).toEqual([]);
  });
});
