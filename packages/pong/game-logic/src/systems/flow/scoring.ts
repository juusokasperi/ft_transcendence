// packages/pong/game-logic/src/systems/flow/scoring.ts
import type { GameState } from '../../model/state';
import { PAUSE_BETWEEN_POINTS_MS, PAUSE_BETWEEN_GAMES_MS } from '../../constants';
import { rotateService } from '../flow/service';
import { hasGameWinner } from '../flow/win';
import type { TableEnd } from '@pong/shared';
import type { FrameEvents } from '@pong/shared';

export function maybeScoreAndFreeze(s: GameState, events: FrameEvents): GameState {
  const goalX = s.bounds.halfLengthX + s.bounds.ballRadius;
  const x = s.ball.x;

  if (x <= -goalX) return handlePointScored('east', s, events, goalX);
  if (x >= goalX) return handlePointScored('west', s, events, goalX);
  return s;
}

function handlePointScored(
  tableEnd: TableEnd,
  s: GameState,
  events: FrameEvents,
  goalX: number,
): GameState {
  const freezeX = tableEnd === 'east' ? -goalX : goalX;
  const freezeZ = s.ball.z;

  events.explode = { x: freezeX, z: freezeZ };

  const points =
    tableEnd === 'east'
      ? { ...s.points, west: s.points.west + 1 }
      : { ...s.points, east: s.points.east + 1 };

  // Attribute to player totals using current occupancy
  const scoringEnd: TableEnd = tableEnd === 'east' ? 'west' : 'east';
  const scoringPlayer = s.playerAtEnd[scoringEnd];
  const pointsByPlayer =
    scoringPlayer === 'P1'
      ? { ...s.pointsByPlayer, P1: s.pointsByPlayer.P1 + 1 }
      : { ...s.pointsByPlayer, P2: s.pointsByPlayer.P2 + 1 };

  const scored: GameState = {
    ...s,
    points,
    pointsByPlayer,
    // Freeze ball exactly at the goal for the pause
    ball: { x: freezeX, z: freezeZ, vx: 0, vz: 0 },
  };

  const win = hasGameWinner(scored);
  if (win) {
    // Game won → no serve here; arm between-games pause, record winner
    return {
      ...scored,
      phase: 'gameOver',
      gameWinner: win,
      tPauseBtwGamesMs: PAUSE_BETWEEN_GAMES_MS,
    };
  }

  // Normal rally end → short pause between points + next serve info
  const { nextServer, nextTurns } = rotateService(scored);
  return {
    ...scored,
    phase: 'pauseBtwPoints',
    tPauseBtwPointsMs: PAUSE_BETWEEN_POINTS_MS,
    nextServe: nextServer,
    server: nextServer,
    serviceTurnsLeft: nextTurns,
  };
}
