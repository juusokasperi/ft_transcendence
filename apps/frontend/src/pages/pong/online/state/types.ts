export type Status =
  | 'connecting'
  | 'idle'
  | 'in_queue'
  | 'match_found'
  | 'match_accepted'
  | 'starting'
  | 'playing';

export type OpponentInfo = {
  username: string | null;
  mmr: number;
};

export type MatchSide = 'east' | 'west';

export type MatchHandoff = {
  serverUrl: string;
  matchId: string;
  roomIdentifier: string;
  side: MatchSide;
  randomSeed: number;
  joinToken: string;
};

export type MatchEndPayload = {
  reason: string;
  winner?: MatchSide;
};

export type OnlineState = {
  status: Status;
  clientId: string;
  opponent: OpponentInfo;
  serverUrl: string;
  matchId: string;
  roomIdentifier: string;
  seat: 'P1' | 'P2';
  joinToken: string | null;
  randomSeed: number | null;
};
