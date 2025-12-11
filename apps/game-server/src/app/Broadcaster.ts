import type { WebSocket } from 'ws';
import type { MatchSession, PlayerConnectionState } from './RoomRegistry.ts';
import type { FastifyBaseLogger } from '@utils/logger';
import type { AppConfig } from './Config.ts';
import { resolveRoomState } from '../domain/RoomReservation.ts';
import type { RoomState, MatchEndReason } from '@pong/shared/protocol/net';

/**
 * Safely send a JSON‑encoded payload to a WebSocket, logging any send errors.
 *
 * Used by Broadcaster methods to avoid duplicating try/catch and to ensure we
 * never throw from the broadcast path due to network issues.
 */
function safeSend(
  socket: WebSocket | undefined,
  payload: unknown,
  logger: FastifyBaseLogger,
): void {
  if (!socket) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, '[Broadcaster] Failed to send payload');
  }
}

/**
 * Iterate over all occupied seats in a session and invoke a callback.
 *
 * This helper centralizes the “P1/P2 if connected” pattern used by broadcasts.
 */
function forEachSeat(
  session: MatchSession,
  cb: (seat: 'P1' | 'P2', player: PlayerConnectionState) => void,
): void {
  (['P1', 'P2'] as const).forEach((seat) => {
    const player = session.players.get(seat);
    if (player) cb(seat, player);
  });
}

/**
 * Broadcaster is responsible for all **server → client** game messages
 * on the game WebSocket connection:
 *
 *   - ROOM_STATE / START (lifecycle and configuration)
 *   - FRAME (authoritative snapshots)
 *   - RESUME_TOKEN (reconnect support)
 *   - MATCH_END (final result)
 *   - OPPONENT_DISCONNECTED / OPPONENT_RECONNECTED (UX hints for reconnects)
 *
 * It depends on:
 *   - AppConfig for tick rate information.
 *   - RoomReservation / MatchSession for room data and players.
 */
export class Broadcaster {
  private readonly config: AppConfig;
  private readonly logger: FastifyBaseLogger;

  constructor(args: { config: AppConfig; logger: FastifyBaseLogger }) {
    this.config = args.config;
    this.logger = args.logger;
  }

  /**
   * Broadcast a ROOM_STATE snapshot to all connected players for a session.
   *
   * Includes:
   *   - roomIdentifier
   *   - derived state (WAITING_FOR_OPPONENT / READY / PLAYING)
   *   - startAtEpochMs / randomSeed / tickRateHz
   *   - per‑seat players aliases (P1/P2)
   *   - the recipient's seat as a separate field
   */
  broadcastRoomState(session: MatchSession, override?: RoomState): void {
    const players: { P1?: { alias?: string }; P2?: { alias?: string } } = {};
    for (const expected of session.reservation.expectedPlayers.values()) {
      if (expected.seat === 'P1') players.P1 = { alias: expected.alias };
      if (expected.seat === 'P2') players.P2 = { alias: expected.alias };
    }

    const ready = session.players.size === 2;
    const state = override ?? resolveRoomState(session.model.started, ready);
    const payload = {
      type: 'ROOM_STATE' as const,
      roomIdentifier: session.reservation.roomIdentifier,
      state,
      startAtEpochMs: session.reservation.simulationStartTick,
      randomSeed: session.reservation.randomSeed,
      tickRateHz: this.config.tickHz,
      players,
    };

    forEachSeat(session, (seat, player) => {
      safeSend(player.socket, { ...payload, seat }, this.logger);
    });
  }

  /**
   * Broadcast a START message to signal the authoritative start time/config
   * for the match.
   *
   * Sent once after scheduleStart() chooses the final startAtEpochMs and may
   * be used by clients to align local simulation.
   */
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

  /**
   * Send a RESUME_TOKEN message to a single seat.
   *
   * Called by MatchRunner/WSServer when rotation issues a new resume token so
   * the client can store it for reconnects. Annotates whether the match is a
   * tournament match for client‑side resume heuristics.
   */
  broadcastResumeToken(session: MatchSession, seat: 'P1' | 'P2', token: string): void {
    const player = session.players.get(seat);
    if (!player) {
      this.logger.warn('[Broadcaster] Invalid seat for resume token');
      return;
    }
    const message = {
      type: 'RESUME_TOKEN',
      token,
      isTournament: Boolean(session.reservation.tournament),
      tournamentId: session.reservation.tournament?.tournamentId,
    };
    safeSend(player.socket, message, this.logger);
  }

  /**
   * Broadcast a FRAME message to all connected players.
   *
   * The payload contains:
   *   - current GameState
   *   - last events
   *   - match snapshot (scores/history)
   *   - tick index
   *   - opponent axis (from the recipient's POV)
   *
   * This is called once per simulation tick by MatchRunner.tick().
   */
  broadcastFrame(session: MatchSession): void {
    const { model } = session;

    const p1 = session.players.get('P1');
    const p2 = session.players.get('P2');

    forEachSeat(session, (_seat, player) => {
      const axis = player.seat === 'P1' ? (p2?.axis ?? 0) : (p1?.axis ?? 0);
      const payload = {
        type: 'FRAME' as const,
        state: model.state,
        events: model.lastEvents,
        match: model.lastSnapshot,
        tick: model.tick,
        axis,
      };

      safeSend(player.socket, payload, this.logger);
    });
  }

  /**
   * Notify both players that the match has ended.
   *
   * Sends a MATCH_END message with:
   *   - reason ('completed' | 'forfeit' | 'opponent_timeout' | 'error')
   *   - winner (east/west) when available
   *   - summary (OnlineMatchSummary or null) when reporting succeeded
   */
  notifyMatchEnd(
    session: MatchSession,
    reason: MatchEndReason,
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

  /**
   * Notify the remaining player that their opponent disconnected, with a
   * reconnect grace period in milliseconds.
   *
   * Called by ReconnectManager.onDisconnect() when the match is paused for
   * a possible resume.
   */
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

  /**
   * Notify both players that their opponent has successfully reconnected.
   *
   * Called by ReconnectManager.onReconnect() when both seats are present again.
   */
  notifyOpponentReconnected(session: MatchSession): void {
    const payload = { type: 'OPPONENT_RECONNECTED' as const };
    forEachSeat(session, (_seat, player) => {
      safeSend(player.socket, payload, this.logger);
    });
  }
}
