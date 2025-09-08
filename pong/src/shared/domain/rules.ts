// src/game/rules/types.ts
import type { TableEnd } from "@shared/domain/ids";

export type GameRules = {
  targetScore: number; // 11
  winBy: number; // 2
  servesPerTurn: number; // 2 (pre-deuce)
  deuceServesPerTurn: number; // 1 (from deuce)
  deuceAt?: number; // default: targetScore - 1
};

export type MatchRules = {
  bestOf: 3 | 5 | 7;
  switchEndsEachGame: boolean; // true
  decidingGameMidSwapAtPoints?: number; // 5 (table tennis)
  alternateInitialServerEachGame: boolean; // true
};

export type Ruleset = {
  game: GameRules;
  match: MatchRules;
};

export const sideOpposite = (s: TableEnd): TableEnd =>
  s === "east" ? "west" : "east";
