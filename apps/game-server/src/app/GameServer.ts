import type { Redis } from 'ioredis';
import { loadConfig, type AppConfig } from './Config.ts';
import { systemClock, nodeScheduler, type Clock, type Scheduler } from './Time.ts';
import { createRedisFactory } from './RedisFactory.ts';
import { RoomRegistry } from './RoomRegistry.ts';
import { Broadcaster } from './Broadcaster.ts';
import { ResultReporter } from './ResultReporter.ts';
import { MatchRunner } from './MatchRunner.ts';
import { ResumeTokenService } from './ResumeTokenService.ts';
import { ReconnectManager } from './ReconnectManager.ts';
import { createHttpServer } from '../infra/http/index.ts';
import { WSServer } from '../infra/ws/WSServer.ts';
import type { MatchSession } from './RoomRegistry.ts';
import type { OnlineMatchSummary } from '@pong/shared/protocol/net';
import type { CreateRoomRequest } from '../domain/RoomReservation.ts';
import { createLogger, type FastifyBaseLogger } from '@utils/logger';

/**
 * GameServer is the composition root for the game-server process.
 *
 * It wires together:
 *   - configuration, clock and scheduler
 *   - Redis client (for resume tokens and shared state)
 *   - RoomRegistry (reservations + live MatchSession objects)
 *   - Broadcaster (server → client WS messages)
 *   - ResultReporter (HTTP callbacks to the backend API)
 *   - MatchRunner (authoritative tick loop)
 *   - ResumeTokenService + ReconnectManager (disconnect / resume flow)
 *   - WSServer (public `/ws` game endpoint)
 *   - HTTP server (health, metrics, `/admin/rooms`)
 *
 * The only external entrypoint is `index.ts`, which instantiates GameServer
 * and calls `start()`.
 */
export class GameServer {
  // Process-wide configuration loaded from environment.
  private config: AppConfig;
  // Time/source of "now" and scheduling abstraction (wrappable in tests).
  private clock: Clock;
  private scheduler: Scheduler;
  // Service-level logger shared by all sub-components.
  private logger: FastifyBaseLogger;
  // Shared Redis connection used by resume tokens and other infra.
  private redis: Redis;
  // In-memory registry of room reservations and active match sessions.
  private registry: RoomRegistry;
  // Helper for emitting ROOM_STATE/START/FRAME/MATCH_END/etc. WS messages.
  private broadcaster: Broadcaster;
  // Responsible for reporting final results back to the backend API.
  private reporter: ResultReporter;
  // Owns the authoritative simulation loop for each match.
  private runner: MatchRunner;
  // Coordinates disconnect / reconnect / forfeit logic.
  private reconnects: ReconnectManager;
  // WebSocket server accepting player connections.
  private wsServer: WSServer;
  // Issues and consumes resume tokens for reconnect flows.
  private resumeTokens: ResumeTokenService;

  constructor() {
    // Core runtime wiring: config, time, scheduler, logger.
    this.config = loadConfig();
    this.clock = systemClock();
    this.scheduler = nodeScheduler();
    this.logger = createLogger({ service: 'game-server' });

    // Redis is shared between ResumeTokenService (resume tokens) and any
    // future game-server Redis usages.
    const redisFactory = createRedisFactory(this.config.redisUrl);
    this.redis = redisFactory.create();

    // In-memory state holders and helpers.
    this.registry = new RoomRegistry({ logger: this.logger });
    this.broadcaster = new Broadcaster({ config: this.config, logger: this.logger });
    this.reporter = new ResultReporter({
      apiUrl: this.config.apiUrl,
      matchSecret: this.config.matchSecret,
      logger: this.logger,
    });

    const onMatchComplete = (
      session: MatchSession,
      _summary: OnlineMatchSummary | null,
      winner?: 'east' | 'west',
    ) => {
      // Summary is currently only used for logging/notification; the actual
      // reporting is done in ResultReporter before this callback is invoked.
      void _summary;
      const room = session.reservation.roomIdentifier;
      this.logger.info({ room, winner }, '[GameServer] Match finished');

      // Stop resume-token rotation and detach sockets without triggering reconnect/forfeit.
      // Order matters: clear the session in the registry first so any socket "close"
      // handlers will see no active session and bail early.
      const players = Array.from(session.players.values());

      try {
        this.registry.clearSession(room);
      } catch (err) {
        this.logger.warn({ room, err }, '[GameServer] Failed to clear session promptly');
      }

      for (const p of players) {
        try {
          if (p.resumeInterval) {
            clearInterval(p.resumeInterval);
            delete (p as any).resumeInterval;
          }
        } catch {}
        try {
          p.socket?.close(1000, 'match-ended');
        } catch {}
      }
    };

    // MatchRunner owns the game loop and calls back into `onMatchComplete`
    // once a match has naturally finished (or errored).
    this.runner = new MatchRunner({
      scheduler: this.scheduler,
      clock: this.clock,
      broadcaster: this.broadcaster,
      reporter: this.reporter,
      config: this.config,
      logger: this.logger,
      onCompleted: onMatchComplete,
    });

    this.resumeTokens = new ResumeTokenService({
      redis: this.redis,
      logger: this.logger,
    });

    this.reconnects = new ReconnectManager({
      scheduler: this.scheduler,
      logger: this.logger,
      config: this.config,
      broadcaster: this.broadcaster,
      reporter: this.reporter,
      runner: this.runner,
      onForfeit: (session, winner, summary) => {
        onMatchComplete(session, summary, winner);
      },
    });

    this.wsServer = new WSServer({
      config: this.config,
      registry: this.registry,
      broadcaster: this.broadcaster,
      runner: this.runner,
      resumeTokens: this.resumeTokens,
      reconnects: this.reconnects,
      redis: this.redis,
      logger: this.logger,
      reporter: this.reporter,
    });

    // Small Fastify HTTP server for health/metrics/admin (`/admin/rooms`).
    createHttpServer({
      adminSecret: this.config.adminSecret,
      port: this.config.httpPort,
      registry: this.registry,
      onCreateRoom: async (body) => {
        const { status } = this.registry.registerRoom(body as CreateRoomRequest);
        return status === 'exists' ? { status: 'exists' } : { status: 'room registered' };
      },
    });
  }

  /**
   * Start the game server:
   *   - bind the WebSocket server on the configured port
   *   - log that startup is complete
   *
   * The HTTP server is started eagerly in the constructor.
   */
  async start(): Promise<void> {
    await this.wsServer.listen();
    this.logger.info({}, '[GameServer] Startup complete');
  }
}
