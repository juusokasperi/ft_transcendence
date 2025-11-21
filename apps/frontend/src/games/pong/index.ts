// src/app/index.ts
export type AppMode = 'local' | 'online' | 'tournament';
import type { PlayerSeat } from '@pong/render';
import type { OnlineMatchSummary } from './modes/online/types';
import type { Preferences } from './modes/shared/preferences';
export type { Preferences } from './modes/shared/preferences';

export type CreateAppOptions = {
  mode: AppMode;
  canvas: HTMLCanvasElement;
  net?: {
    serverUrl: string;
    matchId: string;
    roomIdentifier: string;
    seat: PlayerSeat;
    joinToken: string;
    randomSeed: number;
    onMatchEnd?: (
      reason: string,
      winner?: 'east' | 'west',
      summary?: OnlineMatchSummary | null,
    ) => void;
  };
  preferences?: Preferences;
};

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

// Narrow public surface; only orchestrates the right mode.
export async function createPongApp({ mode, canvas, net, preferences }: CreateAppOptions) {
  if (mode === 'local') {
    const { createLocalApp } = await import('./modes/local/local');
    debugLog('[Pong] Booting local mode');
    return createLocalApp(canvas, preferences);
  }

  if (mode === 'online') {
    const { createOnlineApp } = await import('./modes/online');
    debugLog('[Pong] Booting online mode', {
      matchId: net?.matchId,
      roomIdentifier: net?.roomIdentifier,
    });
    return createOnlineApp(canvas, net!);
  }

  // Stubs for future steps:
  if (mode === 'tournament') throw new Error('tournament mode not implemented yet');
  throw new Error(`Unknown mode: ${mode}`);
}
