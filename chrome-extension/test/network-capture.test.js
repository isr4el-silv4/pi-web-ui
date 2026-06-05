import { describe, expect, it } from 'vitest';
import { createNetworkCapture } from '../network-capture.js';

describe('network capture', () => {
  it('captures requests and response bodies while enabled', () => {
    const capture = createNetworkCapture();
    capture.start();
    capture.recordRequest({ requestId: '1', url: 'https://x.test', method: 'GET' });
    capture.recordResponseBody('1', 'hello');
    expect(capture.getRequests()).toHaveLength(1);
    expect(capture.getRequest('1')).toMatchObject({ requestId: '1' });
    expect(capture.getResponseBody('1')).toEqual({ body: 'hello' });
    capture.stop();
    capture.recordRequest({ requestId: '2', url: 'https://y.test' });
    expect(capture.getRequest('2')).toBeUndefined();
  });
});
