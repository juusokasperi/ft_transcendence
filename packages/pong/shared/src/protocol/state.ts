export type GameHistoryEntry = {
  gameIndex: number;
  east: number;
  west: number;
  winner: 'east' | 'west';
};
