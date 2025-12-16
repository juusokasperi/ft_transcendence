import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT, REDIS_URL } from './utils/config.ts';
import { ClientState, type ClientInfo, type PendingMatch } from './types/types.ts';
import type { MatchmakingClientMessage } from '@pong/shared/protocol/net';
import { extractToken, handleAuth } from './auth/auth.ts';
import {
  handleAcceptMatch,
  handleDeclineMatch,
  handleLeaveQueue,
  tryMatchQueue,
  removeFromQueue,
  clearQueue,
} from './utils/queue.ts';
import {
  handleCreateTournament,
  handleJoinTournament,
  handleLeaveTournament,
  handleForfeitTournament,
  handleAcceptScheduled,
  handleTournamentMatchesReady,
  handleClientDisconnectFromTournament,
  handleTournamentStateUpdated,
  restoreTournamentMembership,
} from './utils/scheduledMatches.ts';
import { handleJoinQueue, handleJoinConfirm } from './utils/queue.ts';
import { handleAdmitConfirmed } from './utils/pendingHandoffs.ts';
import { registerMetrics } from '@utils/metrics';
import { log, createFastifyLoggerConfig } from '@utils/logger';
import {
  inviteRoute,
  handleInviteLobbyJoin,
  isInLobby,
  clearLobbiesWithClient,
  clearInviteLobbies,
} from './utils/invites.ts';
import { MatchmakingRedisBridge } from './utils/MatchmakingRedisBridge.ts';
import { RedisTokenBucket } from '@utils/rate-limiter';
import { isRateLimited } from './utils/ratelimit.ts';
import Redis from 'ioredis';

/**
 * Matchmaking service
 *
 * Responsibilities:
 *   - authenticate clients via site tokens (shared with backend)
 *   - manage ranked queue and pair players by MMR using buckets
 *   - coordinate invite-only lobbies and invite matches
 *   - orchestrate tournament joins, lobbies, scheduled matches, and auto-wins
 *   - request allocations from the allocator and hand off players to game-server nodes
 *   - react to Redis signals (room_ready, tournament streams) via MatchmakingRedisBridge
 */
const app = Fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

// Attach WebSocket support on the /matchmaking route.
await app.register(websocket);

// In-memory registries of connected clients and pending match offers.
const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();

// Shared Redis connections:
//   - redis: general commands + rate limiting
//   - redisStream: Redis Streams consumer for tournaments
//   - redisPubSub: pub/sub for room_ready notifications from game-server
const redis = new Redis(REDIS_URL);
const redisStream = redis.duplicate();
const redisPubSub = redis.duplicate();
const redisBridge = new MatchmakingRedisBridge(
  {
    onRoomReady: handleAdmitConfirmed,
    onMatchesReady: (payload) => handleTournamentMatchesReady(payload, clients),
    onStateUpdated: (payload) => handleTournamentStateUpdated(payload, clients),
  },
  redisPubSub,
  redisStream,
);
await redisBridge.init();
const rateLimiter = new RedisTokenBucket(redis, 'mm:rl');

function getClientByUuid(uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

// HTTP route for creating invite-match lobbies used by the chat/invite flow.
await app.register(inviteRoute, { prefix: '/invite-match', getClientByUuid });

// Periodic tick used to try to match players in the ranked queue.
const queueTicker = setInterval(() => {
  tryMatchQueue(pendingMatches);
}, 500);

app.get('/health', async () => ({ status: 'ok' }));

// Main WebSocket entrypoint for matchmaking clients.
app.get('/matchmaking', { websocket: true }, (socket: WebSocket, req) => {
  void handleConnection(socket, req);
});

/**
 * Handle a new matchmaking WebSocket connection:
 *   - extract and validate site token
 *   - create a ClientInfo, run auth, and register the client
 *   - restore any active tournament membership
 *   - if the client has a pending invite lobby, join it
 *   - attach message/close handlers to drive the matchmaking state machine
 */
async function handleConnection(socket: WebSocket, req: FastifyRequest) {
  const token = extractToken(socket, req.raw);
  if (!token) return;

  const id = uuid();
  const client: ClientInfo = {
    id,
    socket,
    ready: false,
    username: 'Unknown user',
    joinedAt: Date.now(),
    uuid: '',
    mmr: 1000,
    authenticated: false,
    lastRateLimitNotice: Date.now() - 5000,
    state: ClientState.IDLE,
    previousState: undefined,
  };
  log(`Client connected, validating.`, { clientId: client.id });
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  // Inform the client of their server-side clientId (used by the frontend).
  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));

  // Reattach the client to any active tournament they were part of.
  await restoreTournamentMembership(client, clients);

  // If this user was invited into a lobby before connecting, join that lobby now.
  if (await isInLobby(client)) {
    await handleInviteLobbyJoin(client);
    return;
  }

  socket.on('message', async (raw: RawData) => {
    // Per-message rate limiting to protect the service from spammy clients.
    if (await isRateLimited(client, rateLimiter)) return;

    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, { raw: raw.toString() }, 'warn');
      return;
    }
    // Dispatch based on client message type, enforcing state machine invariants.
    switch (data.type) {
      case 'JOIN_QUEUE':
        if (client.state === ClientState.IDLE) handleJoinQueue(client);
        else sendJoinConfirm(client);
        break;
      case 'CONFIRM_JOIN':
        if (client.state !== ClientState.IN_QUEUE) handleJoinConfirm(client);
        break;
      case 'LEAVE_QUEUE':
        if (client.state === ClientState.IN_QUEUE) handleLeaveQueue(client);
        break;
      case 'ACCEPT_MATCH':
        if (client.state === ClientState.PENDING_MATCH_ACCEPTANCE)
          handleAcceptMatch(data.matchId, client, pendingMatches);
        break;
      case 'DECLINE_MATCH':
        if (client.state === ClientState.PENDING_MATCH_ACCEPTANCE)
          handleDeclineMatch(data.matchId, client, pendingMatches);
        break;
      case 'CREATE_TOURNAMENT':
        if (client.state === ClientState.IDLE) void handleCreateTournament(data, client, clients);
        break;
      case 'JOIN_TOURNAMENT':
        if (client.state === ClientState.IDLE) void handleJoinTournament(data, client, clients);
        break;
      case 'LEAVE_TOURNAMENT':
        if (client.state === ClientState.IN_TOURNAMENT) void handleLeaveTournament(client, clients);
        break;
      case 'FORFEIT_TOURNAMENT':
        if (client.state === ClientState.IN_TOURNAMENT)
          void handleForfeitTournament(client, clients);
        break;
      case 'ACCEPT_SCHEDULED':
        if (client.state === ClientState.IN_TOURNAMENT)
          void handleAcceptScheduled(data, client, clients);
        break;
      default:
        log('Unknown message', { type: (data as any).type ?? 'UNKNOWN' });
        client.socket.send(
          JSON.stringify({ type: 'ERROR', message: 'Unknown message from client' }),
        );
    }
  });

  socket.on('close', async () => {
    log('Client disconnected', { id });

    // Clean up any invite lobby the client was participating in.
    clearLobbiesWithClient(client);

    // Update tournament state (unsubscribing, scheduling reminders, etc.).
    handleClientDisconnectFromTournament(client, clients);
    // If the client had a pending match offer, treat this as a decline.
    for (const [matchId, match] of pendingMatches) {
      if (match.a.id === id || match.b.id === id) {
        handleDeclineMatch(matchId, client, pendingMatches);
        break;
      }
    }
    // Remove from ranked queue and forget the client.
    removeFromQueue(id);
    clients.delete(id);
  });
}

function sendJoinConfirm(client: ClientInfo) {
  if (client.state === ClientState.IN_TOURNAMENT || client.state === ClientState.IN_INVITE_LOBBY) {
    const message = ClientState.IN_TOURNAMENT
      ? 'You are in an active tournament. Continue?'
      : 'You are in an invite-only lobby, waiting for your opponent. Continue?';
    client.socket.send(
      JSON.stringify({
        type: 'CONFIRM_REQUIRED',
        message,
      }),
    );
  } else {
    log('Client tried to join queue from unhandled state', {
      clientId: client.id,
      state: client.state,
    });
  }
}

app.addHook('onClose', async () => {
  clearInterval(queueTicker);
  clients.forEach((client) => {
    try {
      client.socket.close();
    } catch {
      // ignore close errors during shutdown
    }
  });
  clients.clear();
  clearQueue();
  pendingMatches.forEach((match) => {
    clearTimeout(match.timer);
  });
  pendingMatches.clear();
  clearInviteLobbies();
  await cleanupRedis();
});

async function cleanupRedis(): Promise<void> {
  await rateLimiter.clearAll();
  await redisBridge.close();
  await redis.quit();
  await redisPubSub.quit();
  await redisStream.quit();
}

try {
  await app.listen({ host: '0.0.0.0', port: PORT });
  log('Server started', { port: PORT });
} catch (err) {
  log('Server failed to start', { err }, 'error');
  process.exit(1);
}
