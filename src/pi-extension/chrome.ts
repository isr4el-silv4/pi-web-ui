import { spawn as nodeSpawn } from 'node:child_process';

export interface ChromeOpenOptions {
  port: number;
}

export interface ChromeOpener {
  open(options: ChromeOpenOptions): Promise<void>;
}

type Platform = NodeJS.Platform;
type Spawn = (command: string, args: string[], options: Parameters<typeof nodeSpawn>[2]) => { unref?: () => void };

export function getChromeCommandCandidates(platform: Platform): string[] {
  if (platform === 'darwin') return ['open'];
  if (platform === 'win32') return ['cmd'];
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
}

function argsFor(command: string, url: string): string[] {
  if (command === 'open') return ['-a', 'Google Chrome', url];
  if (command === 'cmd') return ['/c', 'start', 'chrome', url];
  return [url];
}

export function createChromeOpener(deps: { spawn?: Spawn; platform?: Platform } = {}): ChromeOpener {
  const spawn = deps.spawn ?? nodeSpawn;
  const platform = deps.platform ?? process.platform;

  return {
    async open({ port }) {
      const command = getChromeCommandCandidates(platform)[0];
      const url = `http://localhost:${port}/open`;
      const child = spawn(command, argsFor(command, url), { detached: true, stdio: 'ignore' });
      child.unref?.();
    },
  };
}
