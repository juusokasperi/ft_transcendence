import type { WebSocket } from 'ws';
import type { Logger } from './Logger.ts';
import {
  createRoomReservation,
  seatForSide,
  type CreateRoomRequest,
} from '../domain/RoomReservation.ts';
import { MatchModel } from '../domain/MatchModel.ts';
import type { RoomReservation, Seat } from '../domain/MatchTypes.ts';

export type PlayerConnectionState = {
  seat: Seat;
  axis: number;
  playerIdentifier: string;
  tokenJti: string;
  participantId?: number;
  alias?: string;
  mmr: number;
  socket?: WebSocket;
};

export type MatchSession = {
  reservation: RoomReservation;
  model: MatchModel;
  players: Map<Seat, PlayerConnectionState>;
};

export class RoomRegistry {
  private readonly logger: Logger;
  private readonly reservations = new Map<string, RoomReservation>();
  private readonly sessions = new Map<string, MatchSession>();

  constructor(args: { logger: Logger }) {
    this.logger = args.logger;
  }

  getReservation(roomIdentifier: string): RoomReservation | undefined {
    return this.reservations.get(roomIdentifier);
  }

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

  updateAxis(roomIdentifier: string, seat: Seat, axis: number): void {
    const session = this.sessions.get(roomIdentifier);
    if (!session) return;
    const player = session.players.get(seat);
    if (!player) return;
    player.axis = axis;
  }

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

  clearSession(roomIdentifier: string): void {
    const existing = this.sessions.get(roomIdentifier);
    if (existing) {
      existing.model.cancelLoop();
      this.sessions.delete(roomIdentifier);
    }
    this.reservations.delete(roomIdentifier);
  }

  getSession(roomIdentifier: string): MatchSession | undefined {
    return this.sessions.get(roomIdentifier);
  }

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
