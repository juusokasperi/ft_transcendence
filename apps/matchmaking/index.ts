import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT } from './utils/config.ts';
import type { ClientInfo, Lobby, MatchmakingClientMessage } from './types/types.ts';
import { log } from './utils/log.ts';
import { handleCreateLobby, handleInvite, handleAcceptInvite, handleDeclineInvite, handleReady } from './utils/handlers.ts';
import { broadcastLobbies } from './utils/broadcast.ts';
import { removeClient, cleanupLobby } from './utils/cleanup.ts';

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, ClientInfo>();
const lobbies = new Map<string, Lobby>();

console.log(`Matchmaking WebSocket server listening on ${PORT}`);
log(`Server started on port ${PORT}`);

wss.on('connection', (socket: WebSocket) => {
  const id = uuid();
  const client: ClientInfo = { id, socket, ready: false, username: 'Unknown user' };
  clients.set(id, client);
  log(`Client connected: ${id}`);
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));
  broadcastLobbies(client, lobbies, clients);
  socket.on('message', (raw: RawData) => {
    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, raw.toString());
      return;
    }
    const { type } = data;
    switch (type) {
      case 'createLobby':
        handleCreateLobby(data, client, lobbies, clients);
        break;
      case 'invite':
        handleInvite(data, client, clients);
        break;
      case 'acceptInvite':
        handleAcceptInvite(data, client, lobbies, clients);
        break;
      case 'declineInvite':
        handleDeclineInvite(data, client, lobbies, clients);
        break;
      case 'ready':
        handleReady(data, client, lobbies, clients);
        break;
      default:
        client.socket.send(JSON.stringify({ type: 'error', message: 'Unknown message from client' }));
    }
  });

  socket.on('close', () => {
    log(`Client disconnected: ${id}`);
    removeClient(id, lobbies, clients);
  });
});

wss.on('close', () => {
  log('Server closed, cleaning up');
  clients.clear();
  lobbies.forEach((_, id) => cleanupLobby(id, lobbies, clients));
});
