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

export class GameServer {
  private config: AppConfig;
  private clock: Clock;
  private scheduler: Scheduler;
  private logger: FastifyBaseLogger;
  private redis: Redis;
  private registry: RoomRegistry;
  private broadcaster: Broadcaster;
  private reporter: ResultReporter;
  private runner: MatchRunner;
  private reconnects: ReconnectManager;
  private wsServer: WSServer;
  private resumeTokens: ResumeTokenService;

  constructor() {
    this.config = loadConfig();
    this.clock = systemClock();
    this.scheduler = nodeScheduler();
    this.logger = createLogger({ service: 'game-server' });

    const redisFactory = createRedisFactory(this.config.redisUrl);
    this.redis = redisFactory.create();

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

  async start(): Promise<void> {
    await this.wsServer.listen();
    this.logger.info({}, '[GameServer] Startup complete');
  }
}
