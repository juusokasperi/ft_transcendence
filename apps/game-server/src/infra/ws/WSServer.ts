import fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket, RawData } from 'ws';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../app/Config.ts';
import type { RoomRegistry, MatchSession } from '../../app/RoomRegistry.ts';
import type { Broadcaster } from '../../app/Broadcaster.ts';
import type { MatchRunner } from '../../app/MatchRunner.ts';
import type { ReconnectManager } from '../../app/ReconnectManager.ts';
import { AuthService } from '../../app/AuthService.ts';
import type { ResumeTokenService } from '../../app/ResumeTokenService.ts';
import type { FastifyBaseLogger } from '@utils/logger';
import { reconnectGraceMs } from '../../domain/Policies.ts';

// TODO: Replace with import from AuthService when VerifiedJoinTokenClaims is exported there.
// import type { VerifiedJoinTokenClaims } from '../../app/AuthService.ts';
// type JoinClaims = VerifiedJoinTokenClaims;
type JoinClaims = NonNullable<ReturnType<AuthService['verifyJoinToken']>>;
// TODO: Export a dedicated type from AuthService for better safety.

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
  private readonly auth: AuthService;
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;
  private readonly app: FastifyInstance;

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
    const rotate = async () => {
      const { resumeToken } = await this.resumeTokens.issue({
        roomIdentifier: session.reservation.roomIdentifier,
        playerIdentifier: player.playerIdentifier,
        sessionIdentifier: session.model.id,
        ttlMs: graceMs,
      });
      this.broadcaster.broadcastResumeToken(session, seat, resumeToken);
    };

    this.logger.debug('[WSServer] Attempt: set resume interval');
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

    player.resumeInterval = setInterval(() => {
      void rotate().catch((err) =>
        this.logger.error(
          { err, seat, player: player.playerIdentifier },
          '[WSServer] Resume rotation failure',
        ),
      );
    }, 15_000);
    this.logger.info('[WSServer] Resume interval set');
    connection.on('message', (raw) =>
      this.handleMessage(session.reservation.roomIdentifier, seat, raw),
    );
    connection.on('close', () => {
      this.clearResumeInterval(player);
      this.handleClose(session.reservation.roomIdentifier, seat);
    });
    this.logger.info('[WSServer] Player connection binded');
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

    const session = this.registry.getSession(claims.roomIdentifier);
    if (!session || session.model.id !== claims.sessionIdentifier) {
      connection.close(CLOSE_CODES.ROOM_NOT_FOUND, 'session-not-found');
      return;
    }

    const playerEntry = [...session.players.entries()].find(
      ([, state]) => state.playerIdentifier === claims.playerIdentifier,
    );
    if (!playerEntry) {
      connection.close(CLOSE_CODES.PLAYER_NOT_AUTHORIZED, 'player-not-found');
      return;
    }

    const [seat, player] = playerEntry;
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

  private handleMessage(roomIdentifier: string, seat: 'P1' | 'P2', raw: RawData): void {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'axis') {
        const axis = Number(data.axis) || 0;
        this.registry.updateAxis(roomIdentifier, seat, axis);
      }
    } catch (err) {
      this.logger.warn({ roomIdentifier, err }, '[WSServer] Malformed message');
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
      this.logger.info({ roomIdentifier }, '[WSServer] Room empty, cleaning up');
      this.runner.stop(session);
      this.registry.clearSession(roomIdentifier);
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
