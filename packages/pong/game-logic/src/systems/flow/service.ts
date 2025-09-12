// packages/pong/game-logic/src/systems/flow/service.ts
import type { GameState } from '../../model/state';
import type { TableEnd } from '@pong/shared';

export function inDeuceMode(s: GameState): boolean {
  const deuceAt = s.params.deuceAt ?? s.params.targetScore - 1;
  return s.points.east >= deuceAt && s.points.west >= deuceAt;
}

/** Table-tennis style service rotation (pre/post deuce). */
export function rotateService(s: GameState): {
  nextServer: TableEnd;
  nextTurns: number;
} {
  if (inDeuceMode(s)) {
    let next: TableEnd;
    if (s.server === 'east') {
      next = 'west';
    } else {
      next = 'east';
    }
    return { nextServer: next, nextTurns: s.params.deuceServesPerTurn };
  }

  if (s.serviceTurnsLeft > 1) {
    return { nextServer: s.server, nextTurns: s.serviceTurnsLeft - 1 };
  }

  let nextServer: TableEnd;
  if (s.server === 'east') {
    nextServer = 'west';
  } else {
    nextServer = 'east';
  }
  return { nextServer, nextTurns: s.params.servesPerTurn };
}

/** Determines the next serve from the given table end. */
export function serveFrom(tableEnd: TableEnd, s: GameState): GameState {
  const dir = tableEnd === 'east' ? -1 : 1;
  const angle = 0;
  return {
    ...s,
    paddles: { P1: { z: 0, vz: 0 }, P2: { z: 0, vz: 0 } },
    phase: tableEnd === 'east' ? 'serveEast' : 'serveWest',
    ball: {
      x: 0,
      z: 0,
      vx: dir * s.params.ballSpeed * Math.cos(angle),
      vz: s.params.ballSpeed * Math.sin(angle),
    },
  };
}
