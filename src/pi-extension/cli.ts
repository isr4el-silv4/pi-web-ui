#!/usr/bin/env node
import { createPiWebUiController, parsePiWebUiCommand, type PiWebUiController } from './launcher.js';

export async function runCli(args = process.argv.slice(2), deps: {
  controller?: PiWebUiController;
  cwd?: () => string;
  env?: NodeJS.ProcessEnv;
  write?: (text: string) => void;
} = {}) {
  const controller = deps.controller ?? createPiWebUiController();
  const cwd = deps.cwd ?? process.cwd;
  const env = deps.env ?? process.env;
  const write = deps.write ?? ((text) => process.stdout.write(text));
  const { command } = parsePiWebUiCommand(args);
  const sessionPath = env.PI_SESSION_PATH;
  const result = command === 'start'
    ? await controller.start({ cwd: cwd(), sessionPath })
    : command === 'stop'
      ? await controller.stop()
      : command === 'open'
        ? await controller.open()
        : await controller.status();
  write(`${result}\n`);
}

if (process.argv[1]?.endsWith('/pi-extension/cli.js')) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
