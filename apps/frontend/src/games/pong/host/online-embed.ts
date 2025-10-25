import '@pong/render/ui/tailwind.css';
import '@pong/render/register';
import './gl-shim';
import type { PlayerSeat } from '@pong/render';
import type { OnlineMatchSummary } from '../modes/online/types';

import { createPongApp } from '../index';

export async function bootstrapOnlinePong(
  canvas: HTMLCanvasElement,
  net: {
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
  },
) {
  console.info('[Pong] Initialising online host', {
    matchId: net.matchId,
    room: net.roomIdentifier,
  });
  const app = await createPongApp({ mode: 'online', canvas, net });
  app.start();
  return app;
}
