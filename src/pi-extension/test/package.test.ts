import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const npmIgnore = readFileSync(new URL('../../../.npmignore', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim());

describe('npm bridge distribution', () => {
  it('builds the JavaScript bridge before packing', () => {
    expect(manifest.scripts.prepack).toBe('npm run build');
  });

  it('does not exclude the compiled bridge from the package', () => {
    expect(npmIgnore).not.toContain('dist/');
  });

  it('uses the host TypeBox package at runtime', () => {
    expect(manifest.dependencies['@sinclair/typebox']).toBeUndefined();
    expect(manifest.peerDependencies['@sinclair/typebox']).toBe('*');
    expect(manifest.devDependencies['@sinclair/typebox']).toBe('^0.34.49');
  });
});
