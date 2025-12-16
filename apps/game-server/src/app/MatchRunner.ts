import type { MatchSession } from './RoomRegistry.ts';
import type { Scheduler, Clock } from './Time.ts';
import type { AppConfig } from './Config.ts';
import { quantizeMs } from '../domain/PauseQuantizer.ts';
import { stepOnce } from '../domain/TickEngine.ts';
import { Broadcaster } from './Broadcaster.ts';
import { ResultReporter } from './ResultReporter.ts';
import { SERVE_SELECT_TOTAL_MS } from '@pong/shared';
import type { FastifyBaseLogger } from '@utils/logger';

type MatchOverEvent = { winner?: string; reason?: 'natural' | 'forfeit' | 'timeout' } | undefined;

/**
 * MatchRunner owns the authoritative tick loop for a single match.
 *
 * Responsibilities:
 *   - schedule match start based on reservation/config
 *   - run the simulation at a fixed tick rate via TickEngine
 *   - broadcast FRAME / ROOM_STATE / START through Broadcaster
 *   - detect match-over events and report results
 *
 * It is orchestrated from WSServer and ReconnectManager:
 *   - WSServer calls `scheduleStart` when both players have joined.
 *   - ReconnectManager calls `resume`/`stop` when disconnects/reconnects happen.
 */
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

  /**
   * Compute and schedule the match start time.
   *
   * The start time is the max of:
   *   - reservation.simulationStartTick (from allocator/matchmaking)
   *   - now + minStartDelayMs (buffer for clients to connect)
   *
   * It:
   *   - updates reservation/model with the final start epoch
   *   - broadcasts READY + START to clients
   *   - sets a timer to call startMatch at the chosen time
   */
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

  /**
   * Initialize match state and start the simulation loop, if both players are present.
   *
   * Called after the scheduled start time by scheduleStart. It:
   *   - enforces that both P1 and P2 are connected
   *   - initializes the MatchModel state for serve selection/pause between points
   *   - broadcasts PLAYING room state
   *   - starts the tick interval based on tickHz
   */
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

  /**
   * Resume a paused match loop after a reconnect, if the match has started.
   *
   * Used by ReconnectManager when both players are back in the session.
   */
  resume(session: MatchSession): void {
    if (!session.model.started || session.model.loopActive) return;
    const intervalMs = 1000 / this.config.tickHz;
    session.model.setLoopCancel(this.scheduler.setInterval(() => this.tick(session), intervalMs));
    this.logger.info(
      { room: session.reservation.roomIdentifier },
      '[MatchRunner] Resumed match loop',
    );
  }

  /**
   * Stop the match loop and clear any start timers.
   *
   * - When pauseOnly is true, keep the match "started" so it can be resumed.
   * - Otherwise, mark the model as fully stopped (terminal state).
   */
  stop(session: MatchSession, options: { pauseOnly?: boolean } = {}): void {
    session.model.cancelLoop();
    session.model.clearStartTimeout();
    if (!options.pauseOnly) {
      session.model.markStopped();
    }
  }

  /**
   * Single simulation tick:
   *   - resolve current player intents from RoomRegistry session
   *   - run TickEngine.stepOnce with dt and lag compensation
   *   - apply the step to the MatchModel
   *   - broadcast a FRAME to clients
   *   - handle match-over events by reporting results and emitting MATCH_END
   */
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
      lagCompensationSec: this.config.lagCompensationMs / 1000,
    });

    model.applyStep(result);
    model.tick += 1;

    this.broadcaster.broadcastFrame(session);

    const matchOverEvent = result.events.matchOver as MatchOverEvent;
    if (matchOverEvent && !model.resultSubmitted && !model.resultSubmitting) {
      void this.handleMatchOver(session, matchOverEvent);
    }
  }

  /**
   * Map per-seat input axes into left/right intent for the physics engine.
   *
   * The game model tracks which seat is at the east/west ends of the table; this
   * function uses that mapping to produce consistent left/right axes regardless
   * of which user is P1/P2.
   */
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

  /**
   * Handle a match-over event from the simulation:
   *   - stop the loop and timers
   *   - report the result to the backend via ResultReporter
   *   - broadcast MATCH_END to clients
   *   - call onCompleted so GameServer can clean up the session/sockets
   */
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
