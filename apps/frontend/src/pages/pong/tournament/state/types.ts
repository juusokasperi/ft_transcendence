import type {
  TournamentMatchCountdownStatus,
  TournamentMatchesReadyMessage,
  TournamentMatchState,
} from '../net/messageTypes';

export type TournamentSummary = {
  id: number;
  name?: string;
  status: string;
  maxParticipants: number | null;
  startAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

export type ReadyMatch = TournamentMatchesReadyMessage['matches'][number];

export type CountdownSnapshot = {
  tournamentMatchId: number;
  tournamentId: number;
  stage: ReadyMatch['stage'];
  status: TournamentMatchCountdownStatus;
  targetStartEpochMs: number;
  secondsRemaining: number;
  reason?: 'offline' | 'forfeited' | 'stopped';
};

export type ActiveHandoff = {
  matchId: string;
  roomIdentifier: string;
  gameServerWSUrl: string;
  joinToken: string;
  randomSeed: number;
  side: 'west' | 'east';
};
