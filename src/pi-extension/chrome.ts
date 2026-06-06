import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

export interface ChromeOpenOptions {
  port: number;
}

export interface ChromeOpener {
  open(options: ChromeOpenOptions): Promise<void>;
}

type Platform = NodeJS.Platform;
type Spawn = (command: string, args: string[], options: Parameters<typeof nodeSpawn>[2]) => ChildProcess;

export function getChromeCommandCandidates(platform: Platform): string[] {
  if (platform === 'darwin') return ['open'];
  if (platform === 'win32') return ['cmd'];
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'vivaldi-stable', 'vivaldi', 'xdg-open'];
}

function argsFor(command: string, url: string): string[] {
  if (command === 'open') return ['-a', 'Google Chrome', url];
  if (command === 'cmd') return ['/c', 'start', 'chrome', url];
  return [url];
}

function spawnChild(command: string, url: string, spawn: Spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argsFor(command, url), { detached: true, stdio: 'ignore' });
    child.unref?.();

    child.on('error', (error) => {
      const err = error as NodeJS.ErrnoException;
      reject(err.code === 'ENOENT' ? new Error(`ENOENT: ${command}`) : error);
    });

    // Fire-and-forget: resolve immediately after spawn succeeds.
    // Browser launchers like xdg-open may not emit 'exit' reliably.
    setImmediate(resolve);
  });
}

export function createChromeOpener(deps: { spawn?: Spawn; platform?: Platform } = {}): ChromeOpener {
  const spawn = deps.spawn ?? nodeSpawn;
  const platform = deps.platform ?? process.platform;

  return {
    async open({ port }) {
      const candidates = getChromeCommandCandidates(platform);
      const url = `http://localhost:${port}/open`;

      for (const command of candidates) {
        try {
          await spawnChild(command, url, spawn);
          return;
        } catch (error: unknown) {
          const msg = (error as Error).message ?? '';
          if (!msg.startsWith('ENOENT:')) throw error;
        }
      }

      throw new Error(
        `Chrome browser not found. Tried: ${candidates.join(', ')}. Please install Google Chrome or Chromium.`,
      );
    },
  };
}
