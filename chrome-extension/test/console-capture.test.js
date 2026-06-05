import { describe, expect, it } from 'vitest';
import { createConsoleCapture } from '../console-capture.js';

describe('console capture', () => {
  it('buffers and clears console entries', () => {
    const capture = createConsoleCapture();
    capture.record({ level: 'error', text: 'boom', tabId: 1 });
    expect(capture.getLogs({ levels: ['error'] })).toHaveLength(1);
    capture.clear();
    expect(capture.getLogs({})).toEqual([]);
  });
});
