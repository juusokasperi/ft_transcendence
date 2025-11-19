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

// TournamentDb stores global tournament metadata used across the backend.
export interface TournamentDb {
  id: number;
  name: string; // public tournament title shown in the UI
  description: string; // optional long-form copy for lobby pages
  format: string; // bracket format identifier (e.g. single_elimination)
  status: string; // lifecycle state such as draft/active/completed
  max_participants: number | null; // cap for registered players; null allows open size
  start_at: string | null; // scheduled start timestamp
  completed_at: string | null; // when the tournament finished
  created_at: string; // creation timestamp
  updated_at: string; // last metadata update
}

// TournamentParticipantDb ties registered players or aliases to a tournament entry.
export interface TournamentParticipantDb {
  id: number;
  tournament_id: number;
  user_uuid: string | null; // linked user when available; null for guest alias
  alias: string; // display name used throughout the bracket
  seed: number | null; // bracket seed ordering; null when not seeded yet
  status: string; // registration state (pending/accepted/eliminated)
  joined_at: string; // when the participant enrolled
}

// TournamentMatchDb captures bracket positions that map to eventual matches.
export interface TournamentMatchDb {
  id: number;
  tournament_id: number;
  round_number: number; // sequential round index starting at 1
  round_position: number; // slot within the round (used to build bracket)
  status: string; // match lifecycle (pending/scheduled/completed)
  match_id: number | null; // reference to the actual Matches row once played
  scheduled_at: string | null; // planned start time
  completed_at: string | null; // when results were reported
}

// TournamentMatchPlayerDb tracks which participant occupies each slot of a bracket match.
export interface TournamentMatchPlayerDb {
  id: number;
  tournament_match_id: number;
  participant_id: number;
  team_number: number; // current team slot (1 or 2 for 1v1 brackets)
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

export interface RefreshTokenDb {
  token_id: string;
  user_uuid: string;
  hashed_token: string;
  expires_at: string;
  created_at: string;
}
