import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('loads a host SDK filesystem path with spaces using native Node ESM', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi web ui-'));
  try {
    const source = readFileSync(new URL('../sdk-session.ts', import.meta.url), 'utf8');
    const entry = join(directory, 'sdk-session.mjs');
    writeFileSync(entry, ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText);

    const script = `
      const { loadPiSdk } = await import(${JSON.stringify(pathToFileURL(entry).href)});
      const sdk = await loadPiSdk();
      console.log(typeof sdk.loadPiSdk);
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, PI_HOST_PI: entry },
    });
    expect(stdout.trim()).toBe('function');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
