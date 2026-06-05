import { appendFile } from 'node:fs/promises';

export interface AuditEntry {
  timestamp: number;
  action: string;
  params?: unknown;
}

export function createAuditLog() {
  const log: AuditEntry[] = [];
  return {
    record(entry: Omit<AuditEntry, 'timestamp'>) {
      log.push({ ...entry, timestamp: Date.now() });
    },
    entries() {
      return [...log];
    },
  };
}

export function createFileAuditLog(path: string) {
  return {
    async record(entry: Omit<AuditEntry, 'timestamp'>) {
      await appendFile(path, `${JSON.stringify({ ...entry, timestamp: Date.now() })}\n`);
    },
  };
}
