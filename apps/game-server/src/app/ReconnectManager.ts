import type { Scheduler } from './Time.ts';
import type { AppConfig } from './Config.ts';
import type { MatchSession } from './RoomRegistry.ts';
import type { Broadcaster } from './Broadcaster.ts';
import type { ResultReporter } from './ResultReporter.ts';
import { reconnectGraceMs, seatToSide } from '../domain/Policies.ts';
import type { MatchRunner } from './MatchRunner.ts';
import type { FastifyBaseLogger } from '@utils/logger';

export class ReconnectManager {
  private readonly scheduler: Scheduler;
  private readonly logger: FastifyBaseLogger;
  private readonly config: AppConfig;
  private readonly broadcaster: Broadcaster;
  private readonly reporter: ResultReporter;
  private readonly runner: MatchRunner;
  private readonly onForfeit: (
    session: MatchSession,
    winner: 'east' | 'west',
    summary: Awaited<ReturnType<ResultReporter['report']>> | null,
  ) => void;

  constructor(args: {
    scheduler: Scheduler;
    logger: FastifyBaseLogger;
    config: AppConfig;
    broadcaster: Broadcaster;
    reporter: ResultReporter;
    runner: MatchRunner;
    onForfeit: (
      session: MatchSession,
      winner: 'east' | 'west',
      summary: Awaited<ReturnType<ResultReporter['report']>> | null,
    ) => void;
  }) {
    this.scheduler = args.scheduler;
    this.logger = args.logger;
    this.config = args.config;
    this.broadcaster = args.broadcaster;
    this.reporter = args.reporter;
    this.runner = args.runner;
    this.onForfeit = args.onForfeit;
  }

  onDisconnect(session: MatchSession, seat: 'P1' | 'P2'): void {
    const remainingSeat = seat === 'P1' ? 'P2' : 'P1';
    const remainingPlayer = session.players.get(remainingSeat);

    session.model.cancelDisconnectGrace();

    if (!remainingPlayer) {
      this.logger.info(
        { room: session.reservation.roomIdentifier },
        '[ReconnectManager] Both players absent, cleaning session state',
      );
      this.runner.stop(session);
      session.model.markStopped();
      return;
    }

    if (!session.model.started) {
      this.logger.info(
        { room: session.reservation.roomIdentifier },
        '[ReconnectManager] Match not started, waiting for reconnect',
      );
      session.model.clearStartTimeout();
      session.model.markStopped();
      this.broadcaster.broadcastRoomState(session, 'WAITING_FOR_OPPONENT');
    }

    const graceMs = reconnectGraceMs(Boolean(session.reservation.tournament), this.config);
    this.logger.info(
      { room: session.reservation.roomIdentifier, seat, graceMs },
      '[ReconnectManager] Starting disconnect grace period',
    );

    if (session.model.started) {
      this.runner.stop(session, { pauseOnly: true });
      this.broadcaster.notifyOpponentDisconnected(session, seat, graceMs);
    }

    const cancel = this.scheduler.setTimeout(async () => {
      const latest = session.players.get(seat);
      if (latest) {
        this.logger.info(
          { room: session.reservation.roomIdentifier },
          '[ReconnectManager] Player reconnected before grace expired',
        );
        return;
      }
      const winnerSide = seatToSide(session.model.state.playerAtEnd, remainingSeat);
      this.logger.warn(
        { room: session.reservation.roomIdentifier, winnerSide },
        '[ReconnectManager] Grace period expired, awarding win to remaining player',
      );
      try {
        const summary = await this.reporter.report(session, {
          winner: winnerSide,
          reason: 'timeout',
        });
        this.broadcaster.notifyMatchEnd(session, 'opponent_timeout', winnerSide, summary);
        // Close any remaining sockets to stop resume rotation and clean up.
        try {
          for (const p of session.players.values()) {
            try {
              p.socket?.close(1000, 'match-ended');
            } catch {}
          }
        } catch {}
        this.onForfeit(session, winnerSide, summary);
      } catch (error) {
        this.logger.error({ error }, '[ReconnectManager] Failed to finalize forfeit result');
        this.broadcaster.notifyMatchEnd(session, 'error');
        this.onForfeit(session, winnerSide, null);
      }
    }, graceMs);

    session.model.startDisconnectGrace(seat, cancel);
  }

  onReconnect(session: MatchSession, seat: 'P1' | 'P2'): void {
    void seat;
    session.model.cancelDisconnectGrace();
    const hasBothPlayers = Boolean(session.players.get('P1') && session.players.get('P2'));

    // If the match never started (e.g., a player refreshed during countdown), reschedule start.
    if (!session.model.started && hasBothPlayers) {
      this.logger.info(
        { room: session.reservation.roomIdentifier },
        '[ReconnectManager] Rescheduling start after reconnect',
      );
      this.runner.scheduleStart(session);
      return;
    }

    this.broadcaster.notifyOpponentReconnected(session);
    if (session.model.started) {
      this.runner.resume(session);
    }
  }
}
