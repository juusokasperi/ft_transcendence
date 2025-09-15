// src/app/index.ts
export type AppMode = 'local' | 'online' | 'tournament';
import type { PlayerSeat } from '@pong/render';

export type CreateAppOptions = {
  mode: AppMode;
  canvas: HTMLCanvasElement;
  net?: { serverUrl: string; matchId: string; seat: PlayerSeat };
};

// Narrow public surface; only orchestrates the right mode.
export async function createPongApp({ mode, canvas, net }: CreateAppOptions) {
  if (mode === 'local') {
    const { createLocalApp } = await import('./modes/local');
    return createLocalApp(canvas);
  }

  if (mode === 'online') {
    const { createOnlineApp } = await import('./modes/online');
    return createOnlineApp(canvas, net!);
  }

  // Stubs for future steps:
  if (mode === 'tournament') throw new Error('tournament mode not implemented yet');
  throw new Error(`Unknown mode: ${mode}`);
}
