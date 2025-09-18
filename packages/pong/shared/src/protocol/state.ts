export type GameHistoryEntry = {
  gameIndex: number;
  east: number;
  west: number;
  winner: 'east' | 'west';
};

// Minimal public match snapshot consumed by HUD and UIs.
export type MatchSnapshot = {
  bestOf: number;
  currentGameIndex: number;
  gamesHistory: GameHistoryEntry[];
};
