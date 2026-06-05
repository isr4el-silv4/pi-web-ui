import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileAuditLog } from '../audit-log.js';

describe('file audit log', () => {
  it('persists audit entries as json lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-web-ui-audit-'));
    const path = join(dir, 'audit.jsonl');
    const log = createFileAuditLog(path);
    await log.record({ action: 'debugger.sendCdpCommand', params: { method: 'Page.navigate' } });
    const lines = (await readFile(path, 'utf8')).trim().split('\n');
    expect(JSON.parse(lines[0]!)).toMatchObject({ action: 'debugger.sendCdpCommand', params: { method: 'Page.navigate' } });
  });
});
