import type { GameState } from '../../model/state';
import { clampZ } from '../utils';
import type { InputIntent } from '@pong/shared';
import { clamp } from '@pong/shared';

/** Deterministic, pure step. Units: meters/second, seconds. */
export function stepPaddles(s: GameState, inpt: InputIntent, dt: number): GameState {
  const speed = s.params.paddleSpeed;
  const maxZ = s.bounds.halfWidthZ - s.bounds.paddleHalfDepthZ;

  // Clamp axes defensively to [-1, 1]
  const leftAxis = clamp(inpt.leftAxis, -1, 1);
  const rightAxis = clamp(inpt.rightAxis, -1, 1);
  const leftVz = leftAxis * speed;
  const rightVz = rightAxis * speed;

  const leftZ = clampZ(s.paddles.east.z + leftVz * dt, -maxZ, +maxZ);
  const rightZ = clampZ(s.paddles.west.z + rightVz * dt, -maxZ, +maxZ);

  return {
    ...s,
    paddles: { east: { z: leftZ, vz: leftVz }, west: { z: rightZ, vz: rightVz } },
  };
}
