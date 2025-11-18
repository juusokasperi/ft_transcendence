import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyReply, FastifyRequest } from 'fastify';
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

const app = Fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

await app.register(websocket);

const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();

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

// Route for creating invite match lobby
await app.register(inviteRoute, { prefix: '/invite-match' });

const queueTicker = setInterval(() => {
  tryMatchQueue(pendingMatches);
}, 500);

app.get('/health', async () => ({ status: 'ok' }));

app.get('/matchmaking', { websocket: true }, (socket: WebSocket, req) => {
  void handleConnection(socket, req);
});

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

  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));

  if (await isInLobby(client)) {
    await handleInviteLobbyJoin(client);
    return;
  }

  await restoreTournamentMembership(client, clients);

  socket.on('message', async (raw: RawData) => {
    if (await isRateLimited(client, rateLimiter)) return;

    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, { raw: raw.toString() }, 'warn');
      return;
    }
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

    clearLobbiesWithClient(client);

    handleClientDisconnectFromTournament(client, clients);
    for (const [matchId, match] of pendingMatches) {
      if (match.a.id === id || match.b.id === id) {
        handleDeclineMatch(matchId, client, pendingMatches);
        break;
      }
    }
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
