export type Seat = 'P1' | 'P2';
export type TableSide = 'east' | 'west';

export interface ExpectedPlayer {
  playerIdentifier: string;
  side: TableSide;
  seat: Seat;
  joined: boolean;
  participantId?: number;
  alias?: string;
  mmr: number;
}

export interface TournamentReservation {
  tournamentId: number;
  tournamentMatchId: number;
  tournamentStage: 'semifinal' | 'final' | 'bronze';
  participants?: Array<{ participantId: number; userUuid: string; alias?: string }>;
}

export interface RoomReservation {
  roomIdentifier: string;
  idempotencyKey: string;
  capacity: number;
  joinDeadlineAtEpochMs: number;
  randomSeed: number;
  simulationStartTick: number;
  expectedPlayers: Map<string, ExpectedPlayer>;
  consumedJtis: Set<string>;
  tournament?: TournamentReservation;
}

export interface PlayerSession {
  playerIdentifier: string;
  seat: Seat;
  side: TableSide;
  participantId?: number;
  alias?: string;
  mmr: number;
}
