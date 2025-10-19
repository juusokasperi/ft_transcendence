import type { GameHistoryEntry } from '@pong/shared';

export type MatchSummary = {
  winner: 'east' | 'west';
  bestOf: number;
  gamesHistory: GameHistoryEntry[];
  names: { east: string; west: string };
};

