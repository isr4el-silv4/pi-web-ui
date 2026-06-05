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
