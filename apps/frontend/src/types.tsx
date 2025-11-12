// src/types.ts
import type { MatchPlayerStats as MatchPlayerStatsBase } from '@utils/types';

export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  avatar: string | null;
  wins: number;
  losses: number;
  createdAt: string;
  tfaEnabled: boolean;
}

export interface MatchPlayerStats extends MatchPlayerStatsBase {
  uuid?: string;
  matchesWon?: number;
  matchesLost?: number;
  ranking?: number;
  createdAt?: string | null;
}
