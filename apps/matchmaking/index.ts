import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT, REDIS_URL } from './utils/config.ts';
import type { ClientInfo, PendingMatch } from './types/types.ts';
import type { MatchmakingClientMessage } from '@pong/shared/protocol/net';
import { log } from './utils/log.ts';
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
} from './utils/scheduledMatches.ts';
import { handleJoinQueue } from './utils/queue.ts';
import Redis from 'ioredis';
import { handleAdmitConfirmed } from './utils/pendingHandoffs.ts';

const redisSub = new Redis(REDIS_URL);

redisSub.subscribe('room_ready');
redisSub.subscribe('tournament:matches_ready');
redisSub.on('connect', () => {
  log('Redis pub/sub connected');
});
redisSub.on('message', (channel: string, message: string) => {
  console.log(`[MM] Redis: ${channel}: ${message}`);
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
      handleTournamentMatchesReady(payload, clients);
    } catch (err) {
      log(
        'Failed to handle tournament matches ready message',
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

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();

console.log(`Matchmaking WebSocket server listening on ${PORT}`);
log('Server started', { port: PORT });

setInterval(() => {
  tryMatchQueue(pendingMatches);
}, 500);

wss.on('connection', async (socket: WebSocket, req) => {
  const token = extractToken(socket, req);
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
  // broadcastLobbies(client, lobbies, clients); Maybe for tournament system..
  socket.on('message', (raw: RawData) => {
    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, raw.toString(), 'warn');
      return;
    }
    switch (data.type) {
      case 'JOIN_QUEUE':
        handleJoinQueue(client);
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
        handleCreateTournament(data, client);
        break;
      case 'JOIN_TOURNAMENT':
        handleJoinTournament(data, client);
        break;
      case 'LEAVE_TOURNAMENT':
        handleLeaveTournament(client);
        break;
      case 'FORFEIT_TOURNAMENT':
        handleForfeitTournament(client);
        break;
      case 'ACCEPT_SCHEDULED':
        handleAcceptScheduled(client);
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
    clients.delete(id);
    removeFromQueue(id);
    //removeFromTournamentLobby(id)
    //which broadcasts TOURNAMENT_LOBBY_UPDATE or something similar to clients in lobby
    //waiting for tournament to start
  });
});

wss.on('close', () => {
  log('Server closed, cleaning up');
  clients.clear();
  clearQueue();
  //clearScheduledMatches();
});
