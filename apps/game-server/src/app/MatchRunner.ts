import type { MatchSession, PlayerConnectionState } from './RoomRegistry.ts';
import type { Scheduler, Clock } from './Time.ts';
import type { AppConfig } from './Config.ts';
import { quantizeMs } from '../domain/PauseQuantizer.ts';
import { stepOnce } from '../domain/TickEngine.ts';
import { Broadcaster } from './Broadcaster.ts';
import { ResultReporter } from './ResultReporter.ts';
import { SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import type { FastifyBaseLogger } from '@utils/logger';

type MatchOverEvent = { winner?: string } | undefined;

export class MatchRunner {
  private readonly scheduler: Scheduler;
  private readonly clock: Clock;
  private readonly broadcaster: Broadcaster;
  private readonly reporter: ResultReporter;
  private readonly config: AppConfig;
  private readonly logger: FastifyBaseLogger;
  private readonly onCompleted: (
    session: MatchSession,
    summary: Awaited<ReturnType<ResultReporter['report']>>,
    winner?: 'east' | 'west',
  ) => void;

  constructor(args: {
    scheduler: Scheduler;
    clock: Clock;
    broadcaster: Broadcaster;
    reporter: ResultReporter;
    config: AppConfig;
    logger: FastifyBaseLogger;
    onCompleted: (
      session: MatchSession,
      summary: Awaited<ReturnType<ResultReporter['report']>>,
      winner?: 'east' | 'west',
    ) => void;
  }) {
    this.scheduler = args.scheduler;
    this.clock = args.clock;
    this.broadcaster = args.broadcaster;
    this.reporter = args.reporter;
    this.config = args.config;
    this.logger = args.logger;
    this.onCompleted = args.onCompleted;
  }

  scheduleStart(session: MatchSession): void {
    const now = this.clock.now();
    const target = Math.max(
      session.reservation.simulationStartTick,
      now + this.config.minStartDelayMs,
    );
    session.reservation.simulationStartTick = target;
    session.model.startAtEpochMs = target;

    this.broadcaster.broadcastRoomState(session, 'READY');
    this.broadcaster.broadcastStart(session, target);

    session.model.setStartTimeout(
      this.scheduler.setTimeout(
        () => {
          session.model.setStartTimeout(undefined);
          this.startMatch(session);
        },
        Math.max(0, target - now),
      ),
    );
  }

  startMatch(session: MatchSession): void {
    if (session.model.started) return;
    if (!session.players.get('P1') || !session.players.get('P2')) {
      this.logger.warn(
        { room: session.reservation.roomIdentifier },
        '[MatchRunner] Cannot start match, missing players',
      );
      return;
    }

    session.model.markStart(session.model.startAtEpochMs ?? this.clock.now());
    session.model.clearStartTimeout();

    const selectServeMs = quantizeMs(SERVE_SELECT_TOTAL_MS, this.config.tickHz);
    session.model.state = {
      ...session.model.state,
      phase: 'pauseBtwPoints',
      tPauseBtwPointsMs: selectServeMs,
      nextServe: session.model.initialServer,
      server: session.model.initialServer,
      paddles: { east: { z: 0, vz: 0 }, west: { z: 0, vz: 0 } },
      ball: { x: 0, z: 0, vx: 0, vz: 0 },
    };

    this.broadcaster.broadcastRoomState(session, 'PLAYING');

    const intervalMs = 1000 / this.config.tickHz;
    session.model.setLoopCancel(this.scheduler.setInterval(() => this.tick(session), intervalMs));
  }

  resume(session: MatchSession): void {
    if (!session.model.started || session.model.loopActive) return;
    const intervalMs = 1000 / this.config.tickHz;
    session.model.setLoopCancel(this.scheduler.setInterval(() => this.tick(session), intervalMs));
    this.logger.info(
      { room: session.reservation.roomIdentifier },
      '[MatchRunner] Resumed match loop',
    );
  }

  stop(session: MatchSession, options: { pauseOnly?: boolean } = {}): void {
    session.model.cancelLoop();
    session.model.clearStartTimeout();
    if (!options.pauseOnly) {
      session.model.markStopped();
    }
  }

  private tick(session: MatchSession): void {
    const { model } = session;
    const dt = 1 / this.config.tickHz;
    const intent = this.resolveIntent(session);
    const result = stepOnce({
      controller: model.controller,
      dt,
      intent,
      state: model.state,
      tickHz: this.config.tickHz,
    });

    model.applyStep(result);
    model.tick += 1;

    this.broadcaster.broadcastFrame(session);

    const matchOverEvent = result.events.matchOver as MatchOverEvent;
    if (matchOverEvent && !model.resultSubmitted && !model.resultSubmitting) {
      void this.handleMatchOver(session, matchOverEvent);
    }
  }

  private resolveIntent(session: MatchSession): { leftAxis: number; rightAxis: number } {
    const playerAtEnd = session.model.state.playerAtEnd;
    const leftSeat = playerAtEnd.east;
    const rightSeat = playerAtEnd.west;

    const leftPlayer = session.players.get(leftSeat);
    const rightPlayer = session.players.get(rightSeat);

    return {
      leftAxis: leftPlayer?.axis ?? 0,
      rightAxis: rightPlayer?.axis ?? 0,
    };
  }

  private async handleMatchOver(session: MatchSession, matchOver: MatchOverEvent): Promise<void> {
    try {
      this.stop(session);
      const summary = await this.reporter.report(session, matchOver ?? {});
      const winner =
        matchOver?.winner === 'east' || matchOver?.winner === 'west'
          ? (matchOver.winner as 'east' | 'west')
          : undefined;
      this.broadcaster.notifyMatchEnd(session, 'completed', winner, summary);
      this.onCompleted(session, summary, winner);
    } catch (error) {
      this.logger.error({ error }, '[MatchRunner] Failed to handle match completion');
      this.stop(session);
      this.broadcaster.notifyMatchEnd(session, 'error');
      this.onCompleted(session, null, undefined);
    }
  }
}
