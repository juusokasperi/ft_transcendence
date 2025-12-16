/** Logical player seat in the game model (used by MatchModel and RoomRegistry). */
export type Seat = 'P1' | 'P2';
/** Physical side of the table; used by allocator/protocol and mapped to seats. */
export type TableSide = 'east' | 'west';

/** Expected player metadata for a reserved room, derived from allocator/matchmaking. */
export interface ExpectedPlayer {
  /** Stable player identifier (usually user UUID from matchmaking). */
  playerIdentifier: string;
  /** Table side this player should occupy (east/west). */
  side: TableSide;
  /** Logical seat in the game model (P1/P2). */
  seat: Seat;
  /** Whether this player has already joined the game server for this room. */
  joined: boolean;
  /** Tournament participant id when this match belongs to a tournament. */
  participantId?: number;
  /** Display name / alias used for UI and summaries. */
  alias?: string;
  /** Matchmaking rating (MMR) snapshot used for scoring/placement. */
  mmr: number;
}

/**
 * Tournament context attached to a room reservation when the match belongs
 * to a tournament bracket.
 *
 * Allows the game server and ResultReporter to know which tournament and
 * bracket match this room corresponds to.
 */
export interface TournamentReservation {
  tournamentId: number;
  tournamentMatchId: number;
  tournamentStage: 'semifinal' | 'final' | 'bronze';
  participants?: Array<{ participantId: number; userUuid: string; alias?: string }>;
}

/**
 * Immutable reservation for a game room as created by the allocator.
 *
 * Includes:
 *   - identifiers and idempotency key
 *   - capacity and join deadline
 *   - random seed and scheduled simulation start time
 *   - expectedPlayers (who is allowed to join, their side/seat/mmr/alias)
 *   - consumedJtis (join/resume tokens that have been used)
 *   - optional tournament reservation
 */
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

/**
 * Minimal snapshot of a player's session used in reporting and logging.
 *
 * Mirrors the identity/seat/side/alias/mmr parts of PlayerConnectionState.
 */
export interface PlayerSession {
  playerIdentifier: string;
  seat: Seat;
  side: TableSide;
  participantId?: number;
  alias?: string;
  mmr: number;
}
