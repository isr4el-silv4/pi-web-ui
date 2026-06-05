import { describe, expect, it } from 'vitest';
import { createAuditLog } from '../audit-log.js';

describe('audit log', () => {
  it('records sensitive browser actions', () => {
    const log = createAuditLog();
    log.record({ action: 'debugger.sendCdpCommand', params: { method: 'Runtime.evaluate' } });
    expect(log.entries()).toEqual([
      expect.objectContaining({ action: 'debugger.sendCdpCommand', params: { method: 'Runtime.evaluate' } }),
    ]);
  });
});
