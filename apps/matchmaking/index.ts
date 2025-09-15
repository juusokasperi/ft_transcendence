import { WebSocketServer, type WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

interface ClientInfo {
  id: string;
  socket: WebSocket;
  lobbyId?: string;
  ready: boolean;
}

interface Lobby {
  id: string;
  members: Set<string>;
  timeout: NodeJS.Timeout;
}

const PORT = Number(process.env.MATCHMAKING_PORT || 4242);
const LOBBY_TTL_MS = 5 * 60 * 1000; // 5 minutes. We need a timeout to avoid stale lobbies.

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, ClientInfo>();
const lobbies = new Map<string, Lobby>();

function cleanupLobby(id: string) {
  const lobby = lobbies.get(id);
  if (!lobby) return;
  clearTimeout(lobby.timeout);
  lobbies.delete(id);
}

function removeClient(id: string) {
  const client = clients.get(id);
  if (!client) return;
  const lobbyId = client.lobbyId;
  clients.delete(id);
  if (lobbyId) {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.members.delete(id);
      broadcast(lobbyId, { type: 'memberLeft', memberId: id });
      if (!lobby.members.size) cleanupLobby(lobbyId);
    }
  }
}

function broadcast(lobbyId: string, data: any) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const msg = JSON.stringify(data);
  lobby.members.forEach((id) => {
    const c = clients.get(id);
    c?.socket.send(msg);
  });
}

function checkLobbyReady(lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const allReady = Array.from(lobby.members).every(
    (id) => clients.get(id)?.ready,
  );
  if (allReady && lobby.members.size > 0) {
    broadcast(lobbyId, { type: 'lobbyReady', lobbyId });
    cleanupLobby(lobbyId);
  }
}

function log(...args: any[]) {
  console.log('[MM]', ...args);
}

console.log(`Matchmaking WebSocket server listening on ${PORT}`);
log(`Server started on port ${PORT}`);

wss.on('connection', (socket) => {
  const id = uuid();
  const client: ClientInfo = { id, socket, ready: false };
  clients.set(id, client);
  log(`Client connected: ${id}`);
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  socket.on('message', (raw) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, raw.toString());
      return;
    }
    const { type } = data;
    // Implement switch-case for message types later
    if (type === 'createLobby') {
      const lobbyId = uuid();
      const timeout = setTimeout(() => cleanupLobby(lobbyId), LOBBY_TTL_MS);
      lobbies.set(lobbyId, { id: lobbyId, members: new Set([id]), timeout });
      client.lobbyId = lobbyId;
      client.ready = false;
      log(`Lobby created: ${lobbyId} by ${id}`);
      socket.send(JSON.stringify({ type: 'lobbyCreated', lobbyId }));
    } else if (type === 'invite') {
      const { targetId, lobbyId } = data;
      const target = clients.get(targetId);
      if (target) {
        log(`Invite: ${id} invited ${targetId} to lobby ${lobbyId}`);
        target.socket.send(
          JSON.stringify({ type: 'invited', lobbyId, from: id }),
        );
      }
    } else if (type === 'acceptInvite') {
      const { lobbyId } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        log(`AcceptInvite failed: lobby ${lobbyId} not found for client ${id}`);
        return;
      }
      lobby.members.add(id);
      client.lobbyId = lobbyId;
      client.ready = false;
      log(`Invite accepted: ${id} joined lobby ${lobbyId}`);
      broadcast(lobbyId, { type: 'inviteAccepted', memberId: id });
    } else if (type === 'declineInvite') {
      const { lobbyId } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        log(`DeclineInvite failed: lobby ${lobbyId} not found for client ${id}`);
        return;
      }
      log(`Invite declined: ${id} declined lobby ${lobbyId}`);
      broadcast(lobbyId, { type: 'inviteDeclined', memberId: id });
    } else if (type === 'ready') {
      const { lobbyId, ready } = data;
      if (client.lobbyId !== lobbyId) {
        log(`Ready failed: client ${id} tried to set ready for lobby ${lobbyId}, but is in lobby ${client.lobbyId}`);
        return;
      }
      client.ready = !!ready;
      log(`Ready state: ${id} in lobby ${lobbyId} is now ${!!ready}`);
      broadcast(lobbyId, { type: 'memberReady', memberId: id, ready: !!ready });
      checkLobbyReady(lobbyId);
    }
  });

  socket.on('close', () => {
    log(`Client disconnected: ${id}`);
    removeClient(id);
  });
});

wss.on('close', () => {
  log('Server closed, cleaning up');
  clients.clear();
  lobbies.forEach((_, id) => cleanupLobby(id));
});
