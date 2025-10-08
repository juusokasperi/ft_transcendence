import type { GameState } from '../../model/state';
import { isRallyPhase, isServePhase } from '../utils';
import { stepBallTOIInPlace } from '../physics/collisions';
import { maybeScoreAndFreeze } from './scoring';
import { stepPause } from './pause';
import type { FrameEvents } from '@pong/shared';

// Reusable events object to reduce allocations per tick.
const REUSABLE_EVENTS: FrameEvents = {} as FrameEvents;

export function handleSteps(
  state: GameState,
  dt: number,
): { next: GameState; events: FrameEvents } {
  // Start from a shallow copy to avoid accidental mutations of the input state
  let s = { ...state };
  const events = REUSABLE_EVENTS;
  // clear previous contents
  events.wallHit = undefined;
  events.paddleHit = undefined;
  events.explode = undefined;

  // Game-over is a hard stop for physics; match controller will advance flow.
  if (s.phase === 'gameOver') return { next: s, events };

  // All pauses are handled here, deterministically.
  if (s.phase === 'pauseBtwPoints' || s.phase === 'pauseBetweenGames' || s.phase === 'matchOver') {
    return { next: stepPause(s, dt), events };
  }

  // Serve phases simply gate the rally step (your existing behavior).
  if (isServePhase(s.phase)) s = { ...s, phase: 'rally' };

  if (isRallyPhase(s.phase)) {
    // Mutate a cloned ball once per frame to reduce GC churn
    const ball = { ...s.ball };
    stepBallTOIInPlace(s, ball, dt, events);
    s = { ...s, ball };
    // Check for goal → freeze ball & enter pause to next game
    s = maybeScoreAndFreeze(s, events);
  }

  // Return a shallow copy so callers can safely retain it without aliasing
  return { next: s, events: { ...events } };
}
