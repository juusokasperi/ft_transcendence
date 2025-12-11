import { handleSteps, stepPaddles, type GameState } from '@pong/game-logic';
import type { createMatchController } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { quantizeMs } from './PauseQuantizer.ts';

/**
 * TickEngine glues the pure game logic (@pong/game-logic) to the game server.
 *
 * It exposes a single entry point, {@link stepOnce}, which is called from
 * {@link MatchRunner} on every server tick to advance the authoritative state.
 * This file deliberately stays stateless: it just transforms a GameState +
 * player intent into a new GameState, events, and a snapshot.
 */
/**
 * Type alias for the @pong/game-logic match controller used by the game server.
 */
export type MatchController = ReturnType<typeof createMatchController>;

/**
 * Server-side representation of player intent for a single tick.
 *
 * Values come from RoomRegistry (axis per seat) and are mapped to left/right
 * in MatchRunner.resolveIntent before calling stepOnce.
 */
export type Intent = {
  leftAxis: number;
  rightAxis: number;
};

type ControllerEvents = ReturnType<MatchController['afterPhysicsStep']>['events'];

/**
 * Combined event set from:
 *   - physics/logic layer (handleSteps events)
 *   - controller layer (afterPhysicsStep events)
 *
 * These are merged and sent as part of FRAME messages.
 */
export type ServerEvents = FrameEvents & ControllerEvents;

/**
 * Parameters for a single simulation step on the server.
 */
export type StepOnceArgs = {
  /** Current authoritative GameState. */
  state: GameState;
  /** Player intent (axes) in left/right space for this tick. */
  intent: Intent;
  /** Fixed timestep duration (seconds). */
  dt: number;
  /** Tick rate (Hz), used for pause quantization. */
  tickHz: number;
  /** Match controller instance from @pong/game-logic. */
  controller: MatchController;
  /** Optional lag compensation window in seconds. */
  lagCompensationSec?: number;
};

/**
 * Result of a single simulation tick on the server.
 */
export type StepResult = {
  /** Updated GameState. */
  state: GameState;
  /** Combined server events for this tick. */
  events: ServerEvents;
  /** Snapshot of match scores/history after this tick. */
  snapshot: MatchSnapshot;
};

/**
 * Advance the server-side simulation by one tick.
 *
 * Steps:
 *   - apply paddle movement based on intent (stepPaddles)
 *   - run physics/logic via handleSteps (with optional lag compensation)
 *   - quantize new pause timers onto the tick grid when entering pause phases
 *   - let the MatchController post-process state and events
 *   - return the merged GameState, combined events, and a MatchSnapshot
 */
export function stepOnce({
  state,
  intent,
  dt,
  tickHz,
  controller,
  lagCompensationSec,
}: StepOnceArgs): StepResult {
  const withPaddles = stepPaddles(state, intent, dt);
  const prevPhase = withPaddles.phase;
  const stepped = handleSteps(withPaddles, dt, lagCompensationSec ?? 0);
  let nextState = stepped.next;

  // When we *enter* the "pause between points" phase, snap the pause timer
  // onto the server tick grid so countdowns stay aligned between server/client.
  if (prevPhase !== 'pauseBtwPoints' && nextState.phase === 'pauseBtwPoints') {
    const ms = Math.max(0, nextState.tPauseBtwPointsMs ?? 0);
    nextState = { ...nextState, tPauseBtwPointsMs: quantizeMs(ms, tickHz) };
  }

  // Same idea for the "pause between games" phase (e.g. between sets).
  if (prevPhase !== 'pauseBetweenGames' && nextState.phase === 'pauseBetweenGames') {
    const ms = Math.max(0, nextState.tPauseBtwGamesMs ?? 0);
    nextState = { ...nextState, tPauseBtwGamesMs: quantizeMs(ms, tickHz) };
  }

  // Let the higher-level match controller apply game rules (scoring,
  // tournament constraints, etc.) on top of the physics step.
  const controllerResult = controller.afterPhysicsStep(nextState);
  const mergedState = controllerResult.state;
  const events: ServerEvents = { ...stepped.events, ...controllerResult.events };
  const snapshot = controller.getSnapshot();

  return {
    state: mergedState,
    events,
    snapshot,
  };
}
