export const permissionModes = ['observe', 'debug', 'control'] as const;

export type PermissionMode = (typeof permissionModes)[number];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && permissionModes.includes(value as PermissionMode);
}
