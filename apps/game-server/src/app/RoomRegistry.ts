import type { WebSocket } from 'ws';
import {
  createRoomReservation,
  seatForSide,
  type CreateRoomRequest,
} from '../domain/RoomReservation.ts';
import { MatchModel } from '../domain/MatchModel.ts';
import type { RoomReservation, Seat } from '../domain/MatchTypes.ts';
import type { FastifyBaseLogger } from '@utils/logger';

/**
 * In‑memory representation of a player's connection within a running match.
 *
 * This is owned by the game server only (never serialized) and mirrors:
 *   - who the player is (`playerIdentifier`, `participantId`, `alias`, `mmr`)
 *   - where they sit (`seat`, `side` via RoomReservation)
 *   - current input (`axis`)
 *   - transport details (`socket`, `resumeInterval`)
 */
export type PlayerConnectionState = {
  /** Logical seat in the model (P1/P2). */
  seat: Seat;
  /** Latest input axis received for this player [-1..1]. */
  axis: number;
  /** Stable identifier from matchmaking (user UUID). */
  playerIdentifier: string;
  /** Join/resume token jti used for single‑use enforcement. */
  tokenJti: string;
  /** Tournament participant id when this match belongs to a tournament. */
  participantId?: number;
  /** Display name / alias used in UI and summaries. */
  alias?: string;
  /** MMR snapshot used for scoring/placement. */
  mmr: number;
  /** Active WebSocket connection to this player, if any. */
  socket?: WebSocket;
  /** Interval used to rotate resume tokens for this player. */
  resumeInterval?: NodeJS.Timeout;
};

/**
 * Live match session: reservation + model + currently attached players.
 *
 * - `reservation` is immutable high‑level room metadata (players, seed, start time).
 * - `model` is the mutable game state + tick loop.
 * - `players` tracks which seats are currently connected and their input/connection state.
 */
export type MatchSession = {
  reservation: RoomReservation;
  model: MatchModel;
  players: Map<Seat, PlayerConnectionState>;
};

/**
 * RoomRegistry owns:
 *   - all registered room reservations (from allocator/admin HTTP)
 *   - all active match sessions (reservation + MatchModel + players)
 *
 * It is the central lookup for WSServer and MatchRunner to:
 *   - attach/detach players
 *   - create sessions on‑demand
 *   - derive metrics
 */
export class RoomRegistry {
  private readonly logger: FastifyBaseLogger;
  /* Registered room reservations */
  private readonly reservations = new Map<string, RoomReservation>();
  /* Active match sessions */
  private readonly sessions = new Map<string, MatchSession>();

  /* Constructor initialize logger; reservations/sessions maps are created above. */
  constructor(args: { logger: FastifyBaseLogger }) {
    this.logger = args.logger;
  }

  /**
   * Return the reservation for a given room identifier, if it exists.
   * Does not create a session or mutate state.
   */
  getReservation(roomIdentifier: string): RoomReservation | undefined {
    return this.reservations.get(roomIdentifier);
  }

  /**
   * Register a new room from an allocator/admin HTTP request, or return an existing reservation.
   *
   * Idempotency is handled via `roomIdentifier`:
   *   - if a reservation already exists, we return `{ status: 'exists', reservation }`
   *   - otherwise, we create a new `RoomReservation` and store it
   */
  registerRoom(request: CreateRoomRequest): {
    status: 'exists' | 'registered';
    reservation: RoomReservation;
  } {
    const existing = this.reservations.get(request.roomIdentifier);
    if (existing) {
      return { status: 'exists', reservation: existing };
    }

    const reservation = createRoomReservation(request);
    this.reservations.set(reservation.roomIdentifier, reservation);
    return { status: 'registered', reservation };
  }

  /**
   * Ensure there is a live MatchSession for the given room.
   *
   * - If a session already exists, return it.
   * - If only a reservation exists, create a new MatchModel and session.
   * - If neither exist, throw.
   */
  ensureSession(roomIdentifier: string): MatchSession {
    const existing = this.sessions.get(roomIdentifier);
    if (existing) return existing;

    const reservation = this.reservations.get(roomIdentifier);
    if (!reservation) {
      throw new Error(`Room ${roomIdentifier} not registered`);
    }
    const model = MatchModel.create(reservation);
    const session: MatchSession = {
      reservation,
      model,
      players: new Map(),
    };
    this.sessions.set(roomIdentifier, session);
    return session;
  }

  /**
   * Attach a player to a room based on a validated join/resume token.
   *
   * Enforces several invariants:
   *   - room must exist
   *   - player must be expected for this room
   *   - token side must match expected side
   *   - seat must not already be occupied
   *   - token jti must not have been consumed
   *
   * On success:
   *   - creates/ensures a MatchSession
   *   - marks expected.joined = true
   *   - records token jti as consumed
   */
  attachPlayer(
    roomIdentifier: string,
    playerIdentifier: string,
    options: {
      tokenJti: string;
      participantId?: number;
      alias?: string;
      mmr: number;
      side: 'east' | 'west';
      socket: WebSocket;
    },
  ): PlayerConnectionState {
    const reservation = this.reservations.get(roomIdentifier);
    if (!reservation) throw new Error('room-not-found');

    const expected = reservation.expectedPlayers.get(playerIdentifier);
    if (!expected) throw new Error('player-not-authorized');
    if (expected.side !== options.side) throw new Error('side-mismatch');
    if (expected.joined) throw new Error('seat-occupied');
    if (reservation.consumedJtis.has(options.tokenJti)) {
      throw new Error('token-reused');
    }

    const session = this.ensureSession(roomIdentifier);
    const seat = seatForSide(options.side);
    if (session.players.get(seat)?.socket) {
      throw new Error('seat-occupied');
    }

    const record: PlayerConnectionState = {
      seat,
      axis: 0,
      playerIdentifier,
      tokenJti: options.tokenJti,
      participantId: options.participantId,
      alias: options.alias,
      mmr: options.mmr,
      socket: options.socket,
    };
    session.players.set(seat, record);
    expected.joined = true;
    reservation.consumedJtis.add(options.tokenJti);
    return record;
  }

  /**
   * Update the in‑memory input axis for a given seat.
   *
   * Used by WSServer when receiving `axis` messages. If no session/player
   * is present (e.g. after cleanup), this is a no‑op.
   */
  updateAxis(roomIdentifier: string, seat: Seat, axis: number): void {
    const session = this.sessions.get(roomIdentifier);
    if (!session) return;
    const player = session.players.get(seat);
    if (!player) return;
    player.axis = axis;
  }

  /**
   * Detach a player from a session (e.g. on WebSocket close).
   *
   * - Removes the player from `session.players`.
   * - Marks the corresponding `ExpectedPlayer.joined` flag false in the reservation.
   * - Returns the previous PlayerConnectionState so callers can decide how to handle it.
   */
  detachPlayer(roomIdentifier: string, seat: Seat): PlayerConnectionState | undefined {
    const session = this.sessions.get(roomIdentifier);
    if (!session) return undefined;
    const player = session.players.get(seat);
    if (!player) return undefined;

    session.players.delete(seat);
    this.logger.info({ roomIdentifier, seat }, '[RoomRegistry] Player detached');

    const reservation = this.reservations.get(roomIdentifier);
    if (reservation) {
      const expected = Array.from(reservation.expectedPlayers.values()).find(
        (p) => p.seat === seat && p.playerIdentifier === player.playerIdentifier,
      );
      if (expected) {
        expected.joined = false;
      }
    }

    return player;
  }

  /**
   * Clear both the live session and its reservation for a room.
   *
   * Called when a match is fully completed or aborted:
   *   - cancels the tick loop
   *   - removes the MatchSession
   *   - removes the RoomReservation
   */
  clearSession(roomIdentifier: string): void {
    const existing = this.sessions.get(roomIdentifier);
    if (existing) {
      existing.model.cancelLoop();
      this.sessions.delete(roomIdentifier);
    }
    this.reservations.delete(roomIdentifier);
  }

  /** Get the live MatchSession for a room, if any (does not create one). */
  getSession(roomIdentifier: string): MatchSession | undefined {
    return this.sessions.get(roomIdentifier);
  }

  /**
   * Snapshot metrics about all active matches and players.
   *
   * Used by metrics/observability to report:
   *   - total matches
   *   - total connected players
   *   - rooms that are ready (both players joined but not started)
   *   - rooms that are currently playing
   *   - rooms waiting (sessions that exist but are neither ready nor playing)
   */
  metrics() {
    let playerCount = 0;
    let readyCount = 0;
    let playingCount = 0;

    for (const session of this.sessions.values()) {
      if (session.players.has('P1')) playerCount++;
      if (session.players.has('P2')) playerCount++;
      if (session.model.started) {
        playingCount++;
      } else if (session.players.size === 2) {
        readyCount++;
      }
    }

    return {
      matches: this.sessions.size,
      players: playerCount,
      roomsReady: readyCount,
      roomsPlaying: playingCount,
      roomsWaiting: Math.max(this.sessions.size - readyCount - playingCount, 0),
    };
  }
}
