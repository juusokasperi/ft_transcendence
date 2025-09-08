// src/game/systems/flow/win.ts
import type { GameState } from "@game/model/state";
import type { TableEnd } from "@shared/domain/ids";

/** Points-level win (single game): targetScore with winBy margin. */
export function hasGameWinner(s: GameState): TableEnd | null {
  const { east, west } = s.points;
  const { targetScore, winBy } = s.params;
  const diff = east - west;

  let winner: TableEnd | null = null;

  if (east >= targetScore || west >= targetScore) {
    if (Math.abs(diff) >= winBy) {
      if (diff > 0) {
        winner = "east";
      } else {
        winner = "west";
      }
    }
  }

  return winner;
}

/**
 * Match-level win (best-of-N): first to ceil(N/2) games.
 * Pass in your running match games counters and the match best-of.
 */
export function hasMatchWinner(
  gamesWon: { east: number; west: number },
  bestOf: number,
): TableEnd | null {
  const need = Math.ceil(bestOf / 2);

  if (gamesWon.east >= need || gamesWon.west >= need) {
    if (gamesWon.east > gamesWon.west) {
      return "east";
    } else {
      return "west";
    }
  }

  return null;
}
