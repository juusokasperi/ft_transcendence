import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT } from './utils/config.ts';
import type { ClientInfo, PendingMatch } from './types/types.ts';
import type { MatchmakingClientMessage } from '@pong/shared/protocol/net';
import { log } from './utils/log.ts';
import { extractToken, handleAuth } from './auth/auth.ts';
import {
  handleAcceptMatch,
  handleDeclineMatch,
  handleLeaveQueue,
  tryMatchQueue,
} from './utils/queue.ts';
import { handleJoinQueue } from './utils/queue.ts';

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, ClientInfo>();
const queue: ClientInfo[] = [];
const pendingMatches = new Map<string, PendingMatch>();
// const lobbies = new Map<string, Lobby>();

console.log(`Matchmaking WebSocket server listening on ${PORT}`);
log(`Server started on port ${PORT}`);

setInterval(() => {
  tryMatchQueue(queue, pendingMatches);
}, 500);

wss.on('connection', (socket: WebSocket, req) => {
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
  log(`Client connected: ${id}`);
  if (!handleAuth(client, token, clients)) return;
  clients.set(id, client);

  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));
  // broadcastLobbies(client, lobbies, clients); Maybe for tournament system..
  socket.on('message', (raw: RawData) => {
    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, raw.toString());
      return;
    }
    switch (data.type) {
      case 'JOIN_QUEUE':
        handleJoinQueue(client, queue);
        break;
      case 'LEAVE_QUEUE':
        handleLeaveQueue(client, queue);
        break;
      case 'ACCEPT_MATCH':
        handleAcceptMatch(data.matchId, client, pendingMatches);
        break;
      case 'DECLINE_MATCH':
        handleDeclineMatch(data.matchId, client, pendingMatches, queue);
        break;
      // Maybe for the tournament system? Not implemented yet.
      // case 'createLobby':
      //   handleCreateLobby(data, client, lobbies, clients);
      //   break;
      // case 'invite':
      //   handleInvite(data, client, clients);
      //   break;
      // case 'acceptInvite':
      //   handleAcceptInvite(data, client, lobbies, clients);
      //   break;
      // case 'declineInvite':
      //   handleDeclineInvite(data, client, lobbies, clients);
      //   break;
      // case 'ready':
      //   handleReady(data, client, lobbies, clients);
      //   break;
      default:
        client.socket.send(
          JSON.stringify({ type: 'ERROR', message: 'Unknown message from client' }),
        );
    }
  });

  socket.on('close', () => {
    log(`Client disconnected: ${id}`);
    clients.delete(id);
    const idx = queue.findIndex((c) => c.id === id);
    if (idx !== -1) queue.splice(idx, 1);
  });
});

wss.on('close', () => {
  log('Server closed, cleaning up');
  clients.clear();
  queue.length = 0;
  // lobbies.forEach((_, id) => cleanupLobby(id, lobbies, clients));
});
