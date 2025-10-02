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
    const w = collideWalls(s, dt);
    s = w.s;
    if (w.wallHit) events.wallHit = w.wallHit;

    const p = collidePaddle(s, dt);
    s = p.s;
    if (p.paddleHit) events.paddleHit = p.paddleHit;
    s = { ...s, ball: { ...s.ball, x: s.ball.x + s.ball.vx * dt } };

    // Check for goal → freeze ball & enter pause to next game
    s = maybeScoreAndFreeze(s, events);
  }

  return { next: s, events };
}
