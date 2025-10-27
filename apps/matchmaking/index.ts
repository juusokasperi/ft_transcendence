import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT, REDIS_URL } from './utils/config.ts';
import type { ClientInfo, PendingMatch } from './types/types.ts';
import type { MatchmakingClientMessage } from '@pong/shared/protocol/net';
import { logger, log } from './utils/log.ts';
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
import { handleJoinQueue } from './utils/queue.ts';
import Redis from 'ioredis';
import { handleAdmitConfirmed } from './utils/pendingHandoffs.ts';
import { registerMetrics } from '@utils/metrics';

const redisSub = new Redis(REDIS_URL);
const app = Fastify({
  logger: {
    level: 'trace', // filters in logger.ts
  },
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

app.log = logger as FastifyBaseLogger;

redisSub.subscribe('room_ready');
redisSub.subscribe('tournament:matches_ready');
redisSub.subscribe('tournament:state_updated');
redisSub.on('connect', () => {
  log('Redis pub/sub connected');
});
redisSub.on('message', (channel: string, message: string) => {
  log(`[MM] Redis: ${channel}: ${message}`);
  if (channel === 'room_ready') {
    try {
      const { roomIdentifier } = JSON.parse(message);
      handleAdmitConfirmed(roomIdentifier);
    } catch (err) {
      log(
        'Error parsing roomIdentifier from redis',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  } else if (channel === 'tournament:matches_ready') {
    try {
      const payload = JSON.parse(message);
      void handleTournamentMatchesReady(payload, clients);
    } catch (err) {
      log(
        'Failed to handle tournament matches ready message',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  } else if (channel === 'tournament:state_updated') {
    try {
      const payload = JSON.parse(message) as { tournamentId: number };
      void handleTournamentStateUpdated(payload, clients);
    } catch (err) {
      log(
        'Failed to handle tournament state updated message',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  }
});
redisSub.on('error', (err: Error) => {
  log(
    'Redis pub/sub error:',
    { error: err instanceof Error ? err.message : 'Unknown error' },
    'error',
  );
});

await app.register(websocket);

const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();
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
  };
  log(`Client connected, validating.`, { clientId: client.id });
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));
  void restoreTournamentMembership(client, clients);
  // broadcastLobbies(client, lobbies, clients); Maybe for tournament system..
  socket.on('message', (raw: RawData) => {
    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, { raw: raw.toString() }, 'warn');
      return;
    }
    switch (data.type) {
      case 'JOIN_QUEUE':
        handleJoinQueue(client, data.alias);
        break;
      case 'LEAVE_QUEUE':
        handleLeaveQueue(client);
        break;
      case 'ACCEPT_MATCH':
        handleAcceptMatch(data.matchId, client, pendingMatches);
        break;
      case 'DECLINE_MATCH':
        handleDeclineMatch(data.matchId, client, pendingMatches);
        break;
      case 'CREATE_TOURNAMENT':
        void handleCreateTournament(data, client, clients);
        break;
      case 'JOIN_TOURNAMENT':
        void handleJoinTournament(data, client, clients);
        break;
      case 'LEAVE_TOURNAMENT':
        void handleLeaveTournament(client, clients);
        break;
      case 'FORFEIT_TOURNAMENT':
        void handleForfeitTournament(client, clients);
        break;
      case 'ACCEPT_SCHEDULED':
        void handleAcceptScheduled(data, client, clients);
        break;
      default:
        log('Unknown message', { type: (data as any).type ?? 'UNKNOWN' });
        client.socket.send(
          JSON.stringify({ type: 'ERROR', message: 'Unknown message from client' }),
        );
    }
  });

  socket.on('close', () => {
    log('Client disconnected', { id });
    handleClientDisconnectFromTournament(client, clients);
    clients.delete(id);
    removeFromQueue(id);
    //removeFromTournamentLobby(id)
    //which broadcasts TOURNAMENT_LOBBY_UPDATE or something similar to clients in lobby
    //waiting for tournament to start
  });
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
  try {
    await redisSub.quit();
  } catch (err) {
    log(
      'Failed to close redis connection',
      { error: err instanceof Error ? err.message : 'Unknown error' },
      'error',
    );
  }
});

try {
  await app.listen({ host: '0.0.0.0', port: PORT });
  log('Server started', { port: PORT });
} catch (err) {
  log('Server failed to start', { err }, 'error');
  process.exit(1);
}
