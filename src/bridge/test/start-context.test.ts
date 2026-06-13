import { describe, expect, it } from 'vitest';
import { parseStartContext } from '../start-context.js';

describe('bridge start context', () => {
  it('parses valid serialized terminal context', () => {
    expect(parseStartContext(JSON.stringify({
      cwd: '/project',
      sessionPath: '/session.jsonl',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    }))).toEqual({
      cwd: '/project',
      sessionPath: '/session.jsonl',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });
  });

  it('uses safe defaults when optional values are omitted', () => {
    expect(parseStartContext(JSON.stringify({ cwd: '/project' }))).toEqual({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });
  });

  it('rejects invalid JSON and invalid cwd', () => {
    expect(() => parseStartContext('{')).toThrow('Invalid PI_WEB_UI_START_CONTEXT JSON');
    expect(() => parseStartContext(JSON.stringify({ cwd: 12 }))).toThrow('Bridge start context requires cwd');
  });
});
