// src/app/adapters/hud-map.ts
import type { GameState } from "@game";
import type { TableEnd } from "@shared";
import type { GameHistoryEntry } from "@shared/protocol/state";

/** Convert end-based state to player rows when flipped is true (top row = P1). */
export function mapStateForPlayerRows(
  s: GameState,
  flipped: boolean,
): GameState {
  if (!flipped) return s;
  const swappedServer = (s.server === "east" ? "west" : "east") as TableEnd;
  return {
    ...s,
    points: { east: s.points.west, west: s.points.east },
    server: swappedServer,
  };
}

/** Normalize finished games so each row always refers to the same player. */
export function mapHistoryForPlayers(
  history: GameHistoryEntry[] | undefined,
  switchEndsEachGame: boolean,
): GameHistoryEntry[] {
  const list = history ?? [];
  if (!switchEndsEachGame) return list;
  return list.map((g) =>
    g.gameIndex % 2 === 0
      ? {
          gameIndex: g.gameIndex,
          east: g.west,
          west: g.east,
          winner: (g.winner === "east" ? "west" : "east") as TableEnd,
        }
      : g,
  );
}
