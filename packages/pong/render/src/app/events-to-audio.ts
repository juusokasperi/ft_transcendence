import type { FrameEvents } from '@pong/shared';
import type { AudioCommandBus } from '../client/audio/commands';

/**
 * Map deterministic frame events into audio commands.
 * This keeps simulation pure and audio side-effectful.
 */
export function applyFrameEventsToAudio(bus: AudioCommandBus, ev: FrameEvents) {
  if (ev.wallHit) {
    bus.emit({ type: 'sfx.play', id: 'ballHitWall', volume: 0.8 });
  }
  if (ev.paddleHit) {
    bus.emit({ type: 'sfx.play', id: 'ballHitPaddle', volume: 0.9 });
  }
  if (ev.explode) {
    bus.emit({ type: 'sfx.play', id: 'scoreExplosion', volume: 0.95 });
  }
}
