import type { GameState } from '../../model/state';
import { isRallyPhase, isServePhase } from '../utils';
import { collideWalls, collidePaddle } from '../physics/collisions';
import { maybeScoreAndFreeze } from './scoring';
import { stepPause } from './pause';
import type { FrameEvents } from '@pong/shared';

export function handleSteps(
  state: GameState,
  dt: number,
): { next: GameState; events: FrameEvents } {
  // Start from a shallow copy to avoid accidental mutations of the input state
  let s = { ...state };
  const events: FrameEvents = {};

  // Game-over is a hard stop for physics; match controller will advance flow.
  if (s.phase === 'gameOver') return { next: s, events };

  // All pauses are handled here, deterministically.
  if (s.phase === 'pauseBtwPoints' || s.phase === 'pauseBetweenGames' || s.phase === 'matchOver') {
    return { next: stepPause(s, dt), events };
  }

  // Serve phases simply gate the rally step (your existing behavior).
  if (isServePhase(s.phase)) s = { ...s, phase: 'rally' };

  if (isRallyPhase(s.phase)) {
    const SUBSTEPS = 2;
    const subDt = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      const w = collideWalls(s, subDt);
      s = w.s;
      if (w.wallHit && !events.wallHit) events.wallHit = w.wallHit;

      const p = collidePaddle(s, subDt);
      s = p.s;
      if (p.paddleHit && !events.paddleHit) events.paddleHit = p.paddleHit;
      s = { ...s, ball: { ...s.ball, x: s.ball.x + s.ball.vx * subDt } };

      // Check for goal → freeze ball & enter pause to next game
      s = maybeScoreAndFreeze(s, events);
      if (!isRallyPhase(s.phase)) break;
    }
  }

  return { next: s, events };
}
