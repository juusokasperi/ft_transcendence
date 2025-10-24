import type { WebSocket } from 'ws';
import type { MatchSession, PlayerConnectionState } from './RoomRegistry.ts';
import type { Logger } from './Logger.ts';
import type { AppConfig } from './Config.ts';
import { resolveRoomState } from '../domain/RoomReservation.ts';
import type { RoomState } from '@pong/shared/protocol/net';

function safeSend(socket: WebSocket | undefined, payload: unknown, logger: Logger): void {
  if (!socket) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, '[Broadcaster] Failed to send payload');
  }
}

function forEachSeat(
  session: MatchSession,
  cb: (seat: 'P1' | 'P2', player: PlayerConnectionState) => void,
): void {
  (['P1', 'P2'] as const).forEach((seat) => {
    const player = session.players.get(seat);
    if (player) cb(seat, player);
  });
}

export class Broadcaster {
  private readonly config: AppConfig;
  private readonly logger: Logger;

  constructor(args: { config: AppConfig; logger: Logger }) {
    this.config = args.config;
    this.logger = args.logger;
  }

  broadcastRoomState(session: MatchSession, override?: RoomState): void {
    const ready = session.players.size === 2;
    const state = override ?? resolveRoomState(session.model.started, ready);
    const payload = {
      type: 'ROOM_STATE' as const,
      roomIdentifier: session.reservation.roomIdentifier,
      state,
      startAtEpochMs: session.reservation.simulationStartTick,
      randomSeed: session.reservation.randomSeed,
      tickRateHz: this.config.tickHz,
    };

    forEachSeat(session, (seat, player) => {
      safeSend(player.socket, { ...payload, seat }, this.logger);
    });
  }

  broadcastStart(session: MatchSession, startAtEpochMs: number): void {
    const players: { P1?: { alias?: string }; P2?: { alias?: string } } = {};
    for (const expected of session.reservation.expectedPlayers.values()) {
      if (expected.seat === 'P1') players.P1 = { alias: expected.alias };
      if (expected.seat === 'P2') players.P2 = { alias: expected.alias };
    }

    const payload = {
      type: 'START' as const,
      roomIdentifier: session.reservation.roomIdentifier,
      startAtEpochMs,
      randomSeed: session.reservation.randomSeed,
      tickRateHz: this.config.tickHz,
      players,
    };

    forEachSeat(session, (_seat, player) => {
      safeSend(player.socket, payload, this.logger);
    });
  }

  broadcastSnapshot(session: MatchSession): void {
    const { model } = session;
    const payload = {
      type: 'snapshot' as const,
      state: model.state,
      events: model.lastEvents,
      match: model.lastSnapshot,
    };
    forEachSeat(session, (_seat, player) => {
      safeSend(player.socket, payload, this.logger);
    });
  }

  broadcastOpponentAxis(session: MatchSession): void {
    const p1 = session.players.get('P1');
    const p2 = session.players.get('P2');

    safeSend(p1?.socket, { type: 'opponentAxis', axis: p2?.axis ?? 0 }, this.logger);
    safeSend(p2?.socket, { type: 'opponentAxis', axis: p1?.axis ?? 0 }, this.logger);
  }

  notifyMatchEnd(
    session: MatchSession,
    reason: 'opponent_timeout' | 'completed' | 'error',
    winner?: 'east' | 'west',
    summary: unknown = null,
  ): void {
    const payload = {
      type: 'MATCH_END' as const,
      reason,
      winner,
      summary,
    };
    forEachSeat(session, (_seat, player) => {
      safeSend(player.socket, payload, this.logger);
    });
  }

  notifyOpponentDisconnected(
    session: MatchSession,
    seat: 'P1' | 'P2',
    gracePeriodMs: number,
  ): void {
    const opponentSeat = seat === 'P1' ? 'P2' : 'P1';
    const opponent = session.players.get(opponentSeat);
    safeSend(
      opponent?.socket,
      {
        type: 'OPPONENT_DISCONNECTED',
        gracePeriodMs,
      },
      this.logger,
    );
  }

  notifyOpponentReconnected(session: MatchSession): void {
    const payload = { type: 'OPPONENT_RECONNECTED' as const };
    forEachSeat(session, (_seat, player) => {
      safeSend(player.socket, payload, this.logger);
    });
  }
}
