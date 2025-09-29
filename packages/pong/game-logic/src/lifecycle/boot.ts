import type { GameState } from '../model/state.ts';

/** Convenience to begin immediately with a straight rally. */
export function bootAsRally(s: GameState): GameState {
  return {
    ...s,
    phase: 'rally',
    ball: {
      ...s.ball,
      x: 0,
      z: 0,
      vx: s.params.ballSpeed,
      vz: 0,
    },
  };
}
