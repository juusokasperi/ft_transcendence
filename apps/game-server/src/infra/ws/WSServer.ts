import fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket, RawData } from 'ws';
import type { Redis } from 'ioredis';
import { performance } from 'node:perf_hooks';
import type { AppConfig } from '../../app/Config.ts';
import type { RoomRegistry, MatchSession, PlayerConnectionState } from '../../app/RoomRegistry.ts';
import type { Broadcaster } from '../../app/Broadcaster.ts';
import type { MatchRunner } from '../../app/MatchRunner.ts';
import type { ReconnectManager } from '../../app/ReconnectManager.ts';
import { AuthService, type VerifiedJoinTokenClaims } from '../../app/AuthService.ts';
import type { ResumeTokenService } from '../../app/ResumeTokenService.ts';
import type { FastifyBaseLogger } from '@utils/logger';
import { reconnectGraceMs } from '../../domain/Policies.ts';
import { seatToSide } from '../../domain/Policies.ts';
import type { ResultReporter } from '../../app/ResultReporter.ts';
import { RedisTokenBucket } from '@utils/rate-limiter';

type JoinClaims = VerifiedJoinTokenClaims;

const CLOSE_CODES = {
  ROOM_NOT_FOUND: 4404,
  MISSING_TOKEN: 4401,
  INVALID_TOKEN: 4401,
  TOKEN_REUSED: 4403,
  PLAYER_NOT_AUTHORIZED: 4403,
  SEAT_OCCUPIED: 4402,
  SIDE_MISMATCH: 4403,
  JOIN_WINDOW_EXPIRED: 4408,
  SERVER_ERROR: 1011,
};

export class WSServer {
  private readonly config: AppConfig;
  readonly registry: RoomRegistry;
  private readonly broadcaster: Broadcaster;
  private readonly runner: MatchRunner;
  private readonly resumeTokens: ResumeTokenService;
  private readonly reconnects: ReconnectManager;
  private readonly reporter: ResultReporter;
  private readonly auth: AuthService;
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;
  private readonly app: FastifyInstance;
  private readonly rateLimiter: RedisTokenBucket;

  constructor(args: {
    config: AppConfig;
    registry: RoomRegistry;
    broadcaster: Broadcaster;
    runner: MatchRunner;
    resumeTokens: ResumeTokenService;
    reconnects: ReconnectManager;
    redis: Redis;
    logger: FastifyBaseLogger;
    auth?: AuthService;
    reporter: ResultReporter;
    rateLimiter?: RedisTokenBucket;
  }) {
    this.config = args.config;
    this.registry = args.registry;
    this.broadcaster = args.broadcaster;
    this.runner = args.runner;
    this.resumeTokens = args.resumeTokens;
    this.reconnects = args.reconnects;
    this.redis = args.redis;
    this.logger = args.logger;
    this.auth = args.auth ?? new AuthService();
    this.reporter = args.reporter;
    this.rateLimiter = args.rateLimiter ?? new RedisTokenBucket(this.redis, 'gs:rl', 30, 1000);
    this.app = fastify({ logger: true });
  }

  async init(): Promise<void> {
    await this.app.register(websocket);
    this.registerRoutes();
  }

  async listen(): Promise<void> {
    await this.init();
    await this.app.listen({
      port: this.config.wsPort,
      host: '0.0.0.0',
    });
    this.logger.info({ port: this.config.wsPort }, '[WSServer] Listening');
  }

  private parseProtocols(headers: Record<string, unknown>): string[] {
    const raw = headers['sec-websocket-protocol'];
    if (typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  private extractProtocolToken(protocols: string[], tag: string): string | undefined {
    const idx = protocols.findIndex((p) => p.toLowerCase() === tag);
    return idx === -1 ? undefined : protocols[idx + 1];
  }

  private clearResumeInterval(player: PlayerConnectionState): void {
    if (player.resumeInterval) {
      clearInterval(player.resumeInterval);
      delete player.resumeInterval;
    }
  }

  private async bindPlayerConnection(
    session: MatchSession,
    seat: 'P1' | 'P2',
    player: PlayerConnectionState,
    connection: WebSocket,
  ) {
    if (
      player.socket &&
      player.socket !== connection &&
      player.socket.readyState === player.socket.OPEN
    ) {
      this.logger.warn('[WSServer] Closing player socket');
      player.socket.close(4403, 'replaced-by-resume');
    }
    player.socket = connection;
    this.logger.debug('[WSServer] Attempt: Bind player connection');

    const graceMs = reconnectGraceMs(Boolean(session.reservation.tournament), this.config);
    // Choose a rotation cadence with overlap to avoid gaps near disconnects.
    const rotatePeriod = Math.max(3_000, Math.floor(graceMs / 3));
    const rotate = async () => {
      const { resumeToken } = await this.resumeTokens.issue({
        roomIdentifier: session.reservation.roomIdentifier,
        playerIdentifier: player.playerIdentifier,
        sessionIdentifier: session.model.id,
        // Ensure token survives for at least the reconnect grace after last rotation.
        ttlMs: graceMs + rotatePeriod,
      });
      this.broadcaster.broadcastResumeToken(session, seat, resumeToken);
    };

    this.logger.debug('[WSServer] Attempt: set resume interval');
    // Clear any previous rotation timer before installing a new one.
    this.clearResumeInterval(player);
    try {
      await rotate();
    } catch (err) {
      this.logger.error(
        { err, seat, player: player.playerIdentifier },
        '[WSServer] Failed to rotate resume token',
      );
      connection.close(CLOSE_CODES.SERVER_ERROR, 'resume-token-error');
      return;
    }

    // Bind the interval lifecycle to this specific connection to avoid races where
    // an old connection's close handler clears the newly set interval.
    const interval = setInterval(() => {
      void rotate().catch((err) =>
        this.logger.error(
          { err, seat, player: player.playerIdentifier },
          '[WSServer] Resume rotation failure',
        ),
      );
    }, rotatePeriod);
    player.resumeInterval = interval;

    this.logger.info('[WSServer] Resume interval set');
    connection.on('message', (raw) =>
      this.handleMessage(session.reservation.roomIdentifier, seat, raw),
    );
    connection.on('close', () => {
      // Only clear the interval we created for this connection.
      if (player.resumeInterval === interval) {
        clearInterval(interval);
        delete player.resumeInterval;
      }
      this.handleClose(session.reservation.roomIdentifier, seat);
    });
    this.logger.info('[WSServer] Player connection bound');
  }

  private registerRoutes(): void {
    this.app.register((fastify) => {
      fastify.get('/g/:roomId', { websocket: true }, async (connection, req) => {
        try {
          await this.handleConnection(connection, req.params as { roomId: string }, req.headers);
        } catch (error) {
          this.logger.error({ error }, '[WSServer] Unexpected error during connection setup');
          connection.close(CLOSE_CODES.SERVER_ERROR, 'server-error');
        }
      });
    });
  }

  private async handleConnection(
    connection: WebSocket,
    params: { roomId: string },
    headers: Record<string, unknown>,
  ): Promise<void> {
    const roomIdentifier = params.roomId;
    if (!roomIdentifier) {
      connection.close(CLOSE_CODES.ROOM_NOT_FOUND, 'room-not-found');
      return;
    }
    const protocols = this.parseProtocols(headers);
    const resumeToken = this.extractProtocolToken(protocols, 'resume');
    if (resumeToken) {
      await this.handleResumeConnection(connection, roomIdentifier, resumeToken);
      return;
    }

    const joinToken = this.extractProtocolToken(protocols, 'bearer');
    if (!joinToken) {
      connection.close(CLOSE_CODES.MISSING_TOKEN, 'missing-token');
      return;
    }

    await this.handleJoinConnection(connection, roomIdentifier, joinToken);
  }

  private async handleResumeConnection(
    connection: WebSocket,
    roomIdentifier: string,
    resumeToken: string,
  ): Promise<void> {
    const claims = await this.resumeTokens.consume(resumeToken);
    if (!claims) {
      connection.close(CLOSE_CODES.INVALID_TOKEN, 'invalid-resume-token');
      return;
    }
    // Room guard: ensure the URL room matches the token room.
    if (roomIdentifier !== claims.roomIdentifier) {
      this.logger.warn(
        { roomIdentifier, tokenRoom: claims.roomIdentifier },
        '[WSServer] Resume token room mismatch',
      );
      connection.close(CLOSE_CODES.INVALID_TOKEN, 'room-mismatch');
      return;
    }

    const session = this.registry.getSession(claims.roomIdentifier);
    if (!session || session.model.id !== claims.sessionIdentifier) {
      connection.close(CLOSE_CODES.ROOM_NOT_FOUND, 'session-not-found');
      return;
    }

    // Resolve the reconnecting player's seat from reservation; player may have been
    // detached on disconnect, so it might not exist in the session map.
    const expected = session.reservation.expectedPlayers.get(claims.sub);
    if (!expected) {
      connection.close(CLOSE_CODES.PLAYER_NOT_AUTHORIZED, 'player-not-found');
      return;
    }

    const seat = expected.seat === 'P1' || expected.seat === 'P2' ? expected.seat : 'P1';
    let player = session.players.get(seat);

    if (!player) {
      // Player record not present — reattach a lightweight state entry using reservation data.
      try {
        player = this.registry.attachPlayer(session.reservation.roomIdentifier, claims.sub, {
          tokenJti: `resume-${claims.jti}`,
          participantId: expected.participantId,
          alias: expected.alias,
          mmr: expected.mmr ?? 1000,
          side: expected.side,
          socket: connection,
        });
      } catch (err) {
        const code = this.resolveCloseCode(err);
        connection.close(code, err instanceof Error ? err.message : 'unknown-error');
        return;
      }
    }

    await this.bindPlayerConnection(session, seat, player, connection);
    this.reconnects.onReconnect(session, seat);
    this.broadcaster.broadcastRoomState(session);
  }

  private async handleJoinConnection(
    connection: WebSocket,
    roomIdentifier: string,
    joinToken: string,
  ): Promise<void> {
    let claims: JoinClaims;
    try {
      claims = this.auth.verifyJoinToken(joinToken, roomIdentifier);
    } catch (err) {
      this.logger.warn({ roomIdentifier, err }, '[WSServer] Invalid join token');
      connection.close(CLOSE_CODES.INVALID_TOKEN, 'invalid-token');
      return;
    }

    const redisKey = `join-token:${claims.jti}`;
    try {
      const exists = await this.redis.exists(redisKey);
      if (!exists) {
        connection.close(CLOSE_CODES.TOKEN_REUSED, 'token-reused');
        return;
      }
    } catch (err) {
      this.logger.error({ err }, '[WSServer] Failed to check token state');
      connection.close(CLOSE_CODES.SERVER_ERROR, 'server-error');
      return;
    }

    const reservation = this.registry.getReservation(roomIdentifier);
    if (!reservation) {
      connection.close(CLOSE_CODES.ROOM_NOT_FOUND, 'room-not-found');
      return;
    }

    if (Date.now() > reservation.joinDeadlineAtEpochMs) {
      connection.close(CLOSE_CODES.JOIN_WINDOW_EXPIRED, 'join-window-expired');
      return;
    }

    let session: MatchSession;
    try {
      session = this.registry.ensureSession(roomIdentifier);
    } catch {
      connection.close(CLOSE_CODES.ROOM_NOT_FOUND, 'room-not-found');
      return;
    }

    try {
      const expected = reservation.expectedPlayers.get(claims.sub);
      const participantId = expected?.participantId;
      const alias = expected?.alias;
      const mmr = expected?.mmr ?? 1000;

      const player = this.registry.attachPlayer(roomIdentifier, claims.sub, {
        tokenJti: claims.jti,
        participantId,
        alias,
        mmr,
        side: claims.side,
        socket: connection,
      });

      this.logger.info(
        { roomIdentifier, seat: player.seat, player: player.playerIdentifier },
        '[WSServer] Player joined',
      );

      this.broadcaster.broadcastRoomState(session);

      await this.bindPlayerConnection(session, player.seat, player, connection);

      this.afterPlayerJoin(session);
    } catch (err) {
      const code = this.resolveCloseCode(err);
      connection.close(code, err instanceof Error ? err.message : 'unknown-error');
    }
  }

  private async isRateLimited(roomIdentifier: string, seat: 'P1' | 'P2'): Promise<boolean> {
    const session = this.registry.getSession(roomIdentifier);
    const playerId = session?.players.get(seat)?.playerIdentifier;
    if (!playerId) {
      this.logger.warn({ roomIdentifier, seat }, '[WSServer] Missing player for rate limit');
      return false;
    }
    if (await this.rateLimiter.consume(playerId)) return false;
    this.logger.warn({ roomIdentifier, playerId }, '[WSServer] Throttled player input');
    return true;
  }

  private async handleMessage(
    roomIdentifier: string,
    seat: 'P1' | 'P2',
    raw: RawData,
  ): Promise<void> {
    try {
      if (await this.isRateLimited(roomIdentifier, seat)) return;

      const data = JSON.parse(raw.toString());
      if (data.type === 'ping') {
        this.sendPong(roomIdentifier, seat, data);
      } else if (data.type === 'axis') {
        const axis = Number(data.axis) || 0;
        this.registry.updateAxis(roomIdentifier, seat, axis);
      } else if (data.type === 'forfeit') {
        // Handle explicit forfeit from a player: immediately end match and award win to opponent.
        const session = this.registry.getSession(roomIdentifier);
        if (!session) return;
        const winnerSeat: 'P1' | 'P2' = seat === 'P1' ? 'P2' : 'P1';
        // Guard against tests or edge cases where model.state may be undefined
        const winnerSide = seatToSide((session.model.state as any)?.playerAtEnd, winnerSeat);
        // Stop runner to cease frames, then report and broadcast the result.
        try {
          this.runner.stop(session);
        } catch {}
        (async () => {
          try {
            const summary = await this.reporter.report(session, { winner: winnerSide });
            this.broadcaster.notifyMatchEnd(session, 'forfeit', winnerSide, summary);
            // Proactively close player sockets to stop resume rotations and cleanly end session.
            try {
              for (const p of session.players.values()) {
                try {
                  p.socket?.close(1000, 'match-ended');
                } catch {}
              }
            } catch {}
          } catch (error) {
            this.logger.error({ error }, '[WSServer] Failed to finalize forfeit result');
            this.broadcaster.notifyMatchEnd(session, 'error');
          } finally {
            try {
              this.registry.clearSession(roomIdentifier);
            } catch {}
          }
        })().catch(() => void 0);
      }
    } catch (err) {
      this.logger.warn({ roomIdentifier, err }, '[WSServer] Malformed message');
    }
  }

  private sendPong(
    roomIdentifier: string,
    seat: 'P1' | 'P2',
    payload: { clientSentAt?: number },
  ): void {
    const session = this.registry.getSession(roomIdentifier);
    if (!session) return;
    const player = session.players.get(seat);
    const socket = player?.socket;
    if (!socket) return;
    const receivedAt = performance.now();
    const message = {
      type: 'PONG' as const,
      clientSentAt: typeof payload.clientSentAt === 'number' ? payload.clientSentAt : 0,
      serverReceivedAt: receivedAt,
      serverSentAt: performance.now(),
    };
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      this.logger.warn({ err }, '[WSServer] Failed to send PONG');
    }
  }

  private handleClose(roomIdentifier: string, seat: 'P1' | 'P2'): void {
    const session = this.registry.getSession(roomIdentifier);
    if (!session) return;

    this.registry.detachPlayer(roomIdentifier, seat);
    this.broadcaster.broadcastRoomState(session);

    const remainingP1 = session.players.get('P1');
    const remainingP2 = session.players.get('P2');

    if (!remainingP1 && !remainingP2) {
      // Both players have disconnected (or quit) nearly simultaneously.
      // Declare the LAST quitter (current 'seat') as the winner to avoid tournament lock.
      const winnerSeat: 'P1' | 'P2' = seat;
      // Guard against cases where model.state may be undefined (e.g., mocked sessions in tests)
      const winnerSide = seatToSide((session.model.state as any)?.playerAtEnd, winnerSeat);

      this.logger.info(
        { roomIdentifier, winnerSeat, winnerSide },
        '[WSServer] Both players absent, awarding win to last quitter',
      );
      try {
        this.runner.stop(session);
      } catch {}

      (async () => {
        try {
          const summary = await this.reporter.report(session, { winner: winnerSide });
          this.broadcaster.notifyMatchEnd(session, 'forfeit', winnerSide, summary);
          try {
            for (const p of session.players.values()) {
              try {
                p.socket?.close(1000, 'match-ended');
              } catch {}
            }
          } catch {}
        } catch (error) {
          this.logger.error({ error }, '[WSServer] Failed to finalize double-quit fallback result');
          this.broadcaster.notifyMatchEnd(session, 'error');
        } finally {
          try {
            this.registry.clearSession(roomIdentifier);
          } catch {}
        }
      })().catch(() => void 0);
      return;
    }

    this.reconnects.onDisconnect(session, seat);
  }

  private afterPlayerJoin(session: MatchSession): void {
    if (session.players.get('P1') && session.players.get('P2')) {
      if (!session.model.started) {
        this.runner.scheduleStart(session);
        this.redis.publish(
          'room_ready',
          JSON.stringify({
            roomIdentifier: session.reservation.roomIdentifier,
          }),
        );
      } else {
        this.runner.resume(session);
      }
    }
  }

  private resolveCloseCode(err: unknown): number {
    const message = err instanceof Error ? err.message : String(err);
    switch (message) {
      case 'player-not-authorized':
        return CLOSE_CODES.PLAYER_NOT_AUTHORIZED;
      case 'seat-occupied':
        return CLOSE_CODES.SEAT_OCCUPIED;
      case 'side-mismatch':
        return CLOSE_CODES.SIDE_MISMATCH;
      case 'token-reused':
        return CLOSE_CODES.TOKEN_REUSED;
      case 'room-not-found':
        return CLOSE_CODES.ROOM_NOT_FOUND;
      default:
        return CLOSE_CODES.INVALID_TOKEN;
    }
  }
}
