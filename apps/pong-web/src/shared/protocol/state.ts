// src/shared/protocol/state.ts
export type GameHistoryEntry = {
  gameIndex: number;
  east: number;
  west: number;
  winner: "east" | "west";
};
