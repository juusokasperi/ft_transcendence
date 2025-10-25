import { handleSteps, stepPaddles, type GameState } from '@pong/game-logic';
import type { createMatchController } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { quantizeMs } from './PauseQuantizer.ts';

export type MatchController = ReturnType<typeof createMatchController>;

export type Intent = {
  leftAxis: number;
  rightAxis: number;
};

type ControllerEvents = ReturnType<MatchController['afterPhysicsStep']>['events'];

export type ServerEvents = FrameEvents & ControllerEvents;

export type StepOnceArgs = {
  state: GameState;
  intent: Intent;
  dt: number;
  tickHz: number;
  controller: MatchController;
};

export type StepResult = {
  state: GameState;
  events: ServerEvents;
  snapshot: MatchSnapshot;
};

export function stepOnce({ state, intent, dt, tickHz, controller }: StepOnceArgs): StepResult {
  const withPaddles = stepPaddles(state, intent, dt);
  const prevPhase = withPaddles.phase;
  const stepped = handleSteps(withPaddles, dt);
  let nextState = stepped.next;

  if (prevPhase !== 'pauseBtwPoints' && nextState.phase === 'pauseBtwPoints') {
    const ms = Math.max(0, nextState.tPauseBtwPointsMs ?? 0);
    nextState = { ...nextState, tPauseBtwPointsMs: quantizeMs(ms, tickHz) };
  }

  if (prevPhase !== 'pauseBetweenGames' && nextState.phase === 'pauseBetweenGames') {
    const ms = Math.max(0, nextState.tPauseBtwGamesMs ?? 0);
    nextState = { ...nextState, tPauseBtwGamesMs: quantizeMs(ms, tickHz) };
  }

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
