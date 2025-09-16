import '@pong/render/ui/tailwind.css';
import '@pong/render/register';
import './gl-shim';
import type { PlayerSeat } from '@pong/render';

import { createPongApp } from '../index';

export async function bootstrapOnlinePong(
  canvas: HTMLCanvasElement,
  net: { serverUrl: string; matchId: string; seat: PlayerSeat },
) {
  const app = await createPongApp({ mode: 'online', canvas, net });
  app.start();
  return app;
}
