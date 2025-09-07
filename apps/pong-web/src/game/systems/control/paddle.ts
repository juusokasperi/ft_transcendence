// src/game/systems/control/paddle.ts
import type { GameState } from '@game/model/state';
import type { InputIntent } from '@shared/protocol/input';
import { clampZ } from '@game/systems/utils';

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
