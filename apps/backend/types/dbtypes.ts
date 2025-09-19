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

export interface MatchPlayerDb {
  team_number: number;
  points_awarded: number;
  uuid: string | null;
  username: string | null;
  avatar: string | null;
  ranking: number | null;
  created_at: string | null;
}

export interface MatchWithPlayersForUserDb {
  match_id: number;
  team_1_score: number;
  team_2_score: number;
  tournament_id: number | null;
  tournament_stage: string | null;
  points_awarded: number;
  match_created_at: string;
  team_number: number;
  uuid: string | null;
  username: string | null;
  avatar: string | null;
  ranking: number | null;
  user_created_at: string | null;
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
