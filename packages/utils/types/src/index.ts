export type FriendshipStatus = 'friends' | 'request_sent' | 'request_received' | 'none';

export interface PublicUser {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
}

export interface MatchPlayerPublic extends PublicUser {
  rankingDelta: number;
  stats?: MatchPlayerStats;
}

export interface MatchPlayerStats {
  pointsScored: number;
  pointsConceded: number;
  gamesWon: number;
  gamesLost: number;
  maxPointLead: number;
}

export interface MatchWithPlayers {
  id: number;
  team1Score: number;
  team2Score: number;
  players: {
    team1: (MatchPlayerPublic | null)[];
    team2: (MatchPlayerPublic | null)[];
  };
  playedAt: string;
  tournamentId: number | null;
  tournamentStage: string | null;
}

export interface UserStats {
  username: string;
  uuid: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
  wins: number;
  losses: number;
  totalMatches: number;
  online: boolean;
}
