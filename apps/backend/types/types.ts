import 'fastify';
import type { MatchPlayerStats } from '@utils/types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export interface JWTPayload {
  uuid: string;
  username: string;
  tokenId?: string; // for refresh tokens to allow revocation (stateful)
  iat?: number;
  exp?: number;
  purpose?: 'access' | 'two-factor' | 'refresh';
}

export interface User {
  uuid: string;
  username: string;
  email: string;
  passwordHash: string | null;
  tfa: boolean;
  tfaSecret: string | null;
  avatar: string | null;
  ranking: number;
  createdAt: string;
  googleId: string | null;
}

export interface MatchPlayerStatsMe extends MatchPlayerStats {
  matchesWon: number;
  matchesLost: number;
  ranking: number;
  createdAt: string | null;
}

// Domain models for tournament subsystem.
export interface Tournament {
  id: number;
  name: string;
  description: string;
  format: string;
  status: string;
  maxParticipants: number | null;
  startAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentParticipant {
  id: number;
  tournamentId: number;
  userUuid: string | null;
  alias: string;
  seed: number | null;
  status: string;
  joinedAt: string;
}

export interface TournamentMatch {
  id: number;
  tournamentId: number;
  roundNumber: number;
  roundPosition: number;
  status: string;
  matchId: number | null;
  scheduledAt: string | null;
  completedAt: string | null;
}

export interface TournamentMatchPlayer {
  id: number;
  tournamentMatchId: number;
  participantId: number;
  teamNumber: number;
}

export interface UserSettings {
  uuid: string;
  paddleColor: string;
  colorBlindMode: number;
  photoSensitiveMode: number;
}
