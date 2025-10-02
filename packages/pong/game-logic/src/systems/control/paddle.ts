import type { GameState } from '../../model/state';
import { clampZ } from '../utils';
import type { InputIntent } from '@pong/shared';

/** Deterministic, pure step. Units: meters/second, seconds. */
export function stepPaddles(s: GameState, inpt: InputIntent, dt: number): GameState {
  const speed = s.params.paddleSpeed;
  const maxZ = s.bounds.halfWidthZ - s.bounds.paddleHalfDepthZ;

  // Clamp axes defensively to [-1, 1]
  const leftAxis = Math.max(-1, Math.min(1, inpt.leftAxis));
  const rightAxis = Math.max(-1, Math.min(1, inpt.rightAxis));
  const leftVz = leftAxis * speed;
  const rightVz = rightAxis * speed;

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
