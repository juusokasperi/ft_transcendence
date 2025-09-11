import type { FrameEvents } from '@pong/shared';
import type { FXManager } from '../client/fx/manager';

export function applyFrameEvents(fx: FXManager, ev: FrameEvents, ballY: number) {
  if (ev.wallHit) {
    const { side, x, vzAbs } = ev.wallHit;
    fx.wallPulse(side, x, ballY, vzAbs);
  }
  if (ev.explode) {
    const { x, z } = ev.explode;
    fx.burstAt(x, ballY, z);
  }
}
