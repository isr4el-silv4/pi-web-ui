import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';

describe('pi-web-ui cli', () => {
  it('runs parsed launcher command with cwd context', async () => {
    const controller = { start: vi.fn(async () => 'started'), stop: vi.fn(), status: vi.fn(), open: vi.fn() };
    const write = vi.fn();

    await runCli(['start'], { controller, cwd: () => '/project', write });

    expect(controller.start).toHaveBeenCalledWith({ cwd: '/project', sessionPath: undefined });
    expect(write).toHaveBeenCalledWith('started\n');
  });
});
