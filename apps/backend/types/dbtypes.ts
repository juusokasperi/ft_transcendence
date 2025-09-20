export interface UserDb {
  uuid: string;
  username: string;
  email: string;
  password_hash: string | null;
  tfa: number;
  tfa_secret: string | null;
  avatar: string | null;
  ranking: number;
  created_at: string;
  last_seen: string;
  google_id: string | null;
}

export interface UserStatsDb {
  username: string;
  uuid: string;
  avatar: string | null;
  ranking: number;
  created_at: string;
  wins: number;
  losses: number;
  total_matches: number;
  online: number;
}

export interface MatchDb {
  id: number;
  team_1_score: number;
  team_2_score: number;
  created_at: string;
  tournament_id: number | null;
  tournament_stage: string | null;
}

export interface MatchPlayer {
  teamNumber: number;
  rankingDelta: number;
  uuid: string | null;
  username: string | null;
  avatar: string | null;
  ranking: number | null;
  createdAt: string | null;
  // Optional stats from LEFT JOIN MatchPlayerStats
  pointsScored?: number | null;
  pointsConceded?: number | null;
  gamesWon?: number | null;
  gamesLost?: number | null;
  maxPointLead?: number | null;
}

export interface MatchWithPlayersForUserDb {
  match_id: number;
  team_1_score: number;
  team_2_score: number;
  tournament_id: number | null;
  tournament_stage: string | null;
  ranking_delta: number;
  match_created_at: string;
  team_number: number;
  uuid: string | null;
  username: string | null;
  avatar: string | null;
  ranking: number | null;
  user_created_at: string | null;
  // Optional stats from LEFT JOIN MatchPlayerStats
  points_scored?: number | null;
  points_conceded?: number | null;
  games_won?: number | null;
  games_lost?: number | null;
  max_point_lead?: number | null;
}

export interface PublicUserDb {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  created_at: string;
}

export interface PendingUserDb {
  username: string;
  email: string;
  password_hash: string;
  confirmation_token: string;
  expires_at: string;
  created_at: string;
}

export interface UserSettingsDb {
  user_uuid: string;
  paddle_color: string;
  color_blind_mode: number;
  photo_sensitive_mode: number;
}
