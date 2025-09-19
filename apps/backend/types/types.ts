import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export interface JWTPayload {
  uuid: string;
  username: string;
  iat?: number;
  exp?: number;
}

export interface User {
  uuid: string;
  username: string;
  email: string;
  passwordHash: string | null;
  tfa: boolean;
  avatar: string | null;
  ranking: number;
  createdAt: string;
  googleId: string | null;
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

export interface PublicUser {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
}

export interface PublicUserWithPoints extends PublicUser {
  pointsAwarded: number;
}

export interface MatchWithPlayers {
  id: number;
  team1Score: number;
  team2Score: number;
  players: {
    team1: (PublicUserWithPoints | null)[];
    team2: (PublicUserWithPoints | null)[];
  };
  playedAt: string;
  tournamentId: number | null;
  tournamentStage: string | null;
}

export interface UserSettings {
  uuid: string;
  paddleColor: string;
  colorBlindMode: number;
  photoSensitiveMode: number;
}
