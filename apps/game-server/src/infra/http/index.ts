import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { RoomRegistry } from '../../app/RoomRegistry.ts';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

/**
 * Arguments required to bootstrap the game-server HTTP endpoint.
 *
 * This HTTP server is intentionally small:
 *   - `/health` for liveness checks.
 *   - `/metrics` (via registerMetrics) for Prometheus scraping.
 *   - `/admin/rooms` for allocator/backend to create game rooms.
 */
type CreateHttpServerArgs = {
  /** Shared admin secret for protecting `/admin/*` endpoints. */
  adminSecret: string;
  /** Port to listen on (typically the game-server HTTP port from AppConfig). */
  port: number;
  /**
   * RoomRegistry instance used to expose live metrics:
   * its `metrics()` method drives the Prometheus gauges registered below.
   */
  registry: RoomRegistry;
  /**
   * Handler invoked when the admin API requests room creation.
   *
   * Implemented by GameServer to translate the request body into a
   * RoomReservation (or return an error). Kept as a callback to keep this
   * infra layer unaware of business logic.
   */
  onCreateRoom: (body: unknown) => Promise<unknown>;
};

/**
 * Create and start the HTTP server for the game-server process.
 *
 * Responsibilities:
 *   - configure Fastify with structured logging
 *   - register Prometheus metrics for room/player counts
 *   - expose `/health` for liveness
 *   - expose `/admin/rooms` for allocator/backend, guarded by `x-admin-secret`
 *
 * This is wired from `GameServer.ts`, which passes the RoomRegistry and the
 * `onCreateRoom` callback that knows how to register a new room.
 */
export function createHttpServer({
  adminSecret,
  port,
  registry,
  onCreateRoom,
}: CreateHttpServerArgs): FastifyInstance {
  // Fastify instance shared by health, metrics and admin endpoints.
  const app = fastify({ logger: createFastifyLoggerConfig({ service: 'game-server' }) });
  // Attach `/metrics` endpoint and base metrics (process, HTTP, etc.).
  registerMetrics(app, { labels: { service: 'game-server' } });

  app.after(() => {
    /**
     * Helper to register a Prometheus Gauge that is recomputed on each scrape
     * from the latest `RoomRegistry.metrics()` snapshot.
     */
    const createDynamicGauge = (
      name: string,
      help: string,
      metric: keyof ReturnType<RoomRegistry['metrics']>,
    ) => {
      new app.metrics.client.Gauge({
        name,
        help,
        collect() {
          this.set(registry.metrics()[metric]);
        },
      });
    };

    // High-level game-server metrics surfaced to Prometheus.
    createDynamicGauge('game_server_matches', 'Number of matches being played', 'matches');
    createDynamicGauge('game_server_players', 'Number of players connected', 'players');
    createDynamicGauge(
      'game_server_rooms_waiting',
      'Number of rooms waiting for players',
      'roomsWaiting',
    );
    createDynamicGauge('game_server_rooms_ready', 'Number of rooms ready to start', 'roomsReady');
    createDynamicGauge(
      'game_server_rooms_playing',
      'Number of rooms currently playing',
      'roomsPlaying',
    );
  });

  /**
   * Simple shared-secret auth for admin routes.
   *
   * Allocator/backend calls must send `x-admin-secret` matching `adminSecret`;
   * otherwise a 403 is returned. This keeps the game-server HTTP surface
   * private while still being simple to integrate with Docker/Nginx.
   */
  const authPreHandler = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const secret = request.headers['x-admin-secret'];
    if (!secret || secret !== adminSecret) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    done();
  };

  // Lightweight liveness endpoint used by Docker/infra probes.
  app.get('/health', { logLevel: 'silent' }, async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  /**
   * Admin endpoint used by the allocator/backend to create a new game room.
   *
   * - Protected by `authPreHandler` and `x-admin-secret`.
   * - Delegates the body to `onCreateRoom`, which performs validation and
   *   may throw; errors are mapped to a 400 with a simple `{ error }` payload.
   */
  app.post('/admin/rooms', { preHandler: [authPreHandler] }, async (request, reply) => {
    try {
      const result = await onCreateRoom(request.body);
      reply.send(result ?? { status: 'ok' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      reply.status(400).send({ error: message });
    }
  });

  // Start listening for incoming HTTP traffic on the configured port.
  app.listen({ port, host: '0.0.0.0' }, (err: Error | null) => {
    if (err) {
      app.log.error(err, 'Failed to start HTTP server');
      process.exit(1);
    }
    app.log.info(`HTTP Endpoint listening on http://0.0.0.0:${port}`);
  });

  return app;
}
