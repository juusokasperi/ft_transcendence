import type { GameState } from '../../model/state';
import { clampZ } from '../utils';
import type { InputIntent } from '@pong/shared';

/** Deterministic, pure step. Units: meters/second, seconds. */
export function stepPaddles(s: GameState, inpt: InputIntent, dt: number): GameState {
  const speed = s.params.paddleSpeed;
  const maxZ = s.bounds.halfWidthZ - s.bounds.paddleHalfDepthZ;

  const leftVz = inpt.leftAxis * speed;
  const rightVz = inpt.rightAxis * speed;

  const leftZ = clampZ(s.paddles.P1.z + leftVz * dt, -maxZ, +maxZ);
  const rightZ = clampZ(s.paddles.P2.z + rightVz * dt, -maxZ, +maxZ);

  return {
    ...s,
    paddles: {
      P1: { z: leftZ, vz: leftVz },
      P2: { z: rightZ, vz: rightVz },
    },
  };
}
