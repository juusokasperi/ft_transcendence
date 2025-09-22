import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';
import { parse } from 'path';

dotenv.config();

interface ClientInfo {
  id: string;
  socket: WebSocket;
  username: string;
  lobbyId?: string;
  ready: boolean;
}

interface Lobby {
  id: string;
  members: Set<string>;
  timeout: NodeJS.Timeout;
  hostName: string;
  capacity: number;
}

const PORT = Number(process.env.MATCHMAKING_PORT || 4242);
const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'ws://localhost:55553';
const LOBBY_TTL_MS = 5 * 60 * 1000; // 5 minutes. We need a timeout to avoid stale lobbies.
const LOBBY_SIZE = 2;

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<string, ClientInfo>();
const lobbies = new Map<string, Lobby>();

function cleanupLobby(id: string) {
  const lobby = lobbies.get(id);
  if (!lobby) return;
  clearTimeout(lobby.timeout);
  lobbies.delete(id);
  broadcastLobbies();
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
      else broadcastLobbies();
    }
  }
}

function removeClientFromLobby(id: string) {
  const client = clients.get(id);
  if (!client) return;
  const lobbyId = client.lobbyId;
  if (lobbyId) {
    client.lobbyId = undefined;
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.members.delete(id);
      broadcast(lobbyId, { type: 'memberLeft', memberId: id });
      if (!lobby.members.size) cleanupLobby(lobbyId);
      else broadcastLobbies();
    }
  }
};

function parseLobbyInfo(lobby: Lobby): any {
  return {
    lobbyId: lobby.id,
    hostName: lobby.hostName,
    capacity: lobby.capacity,
    membersCount: lobby.members.size,
  };
};

function broadcastLobbies(clientTo: ClientInfo) {
  const openLobbies = Array.from(lobbies.values())
    .map(lobby => parseLobbyInfo(lobby));
  const msg = JSON.stringify({ type: 'lobbyList', lobbies: openLobbies });
  if (clientTo)
  {
    clientTo.socket.send(msg);
  } else {
    clients.forEach(client => {
      client.socket.send(msg);
    });
  }
}

function broadcastToAll(data: any) {
  const msg = JSON.stringify(data);
  clients.forEach(client => {
    client.socket.send(msg);
  });
};

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
  const members = Array.from(lobby.members);
  const allReady = members.every((id) => clients.get(id)?.ready);
  if (allReady && members.length === 2) {
    const matchId = uuid();
    members.forEach((id, idx) => {
      const seat = idx === 0 ? 'P1' : 'P2';
      clients.get(id)?.socket.send(
        JSON.stringify({
          type: 'matchFound',
          lobbyId,
          matchId,
          gameServerUrl: GAME_SERVER_URL,
          seat,
        }),
      );
    });
    cleanupLobby(lobbyId);
  }
}

function log(...args: any[]) {
  console.log('[MM]', ...args);
}

function handleCreateLobby(data: any, client: ClientInfo) {
  const lobbyId = uuid();
  const timeout = setTimeout(() => cleanupLobby(lobbyId), LOBBY_TTL_MS);
  lobbies.set(lobbyId, { id: lobbyId, members: new Set([client.id]), timeout, hostName: client.username, capacity: LOBBY_SIZE });
  log(`Lobby created: ${lobbyId} by ${client.id} / ${client.username}`);
  client.lobbyId = lobbyId;
  client.ready = false;
  client.socket.send(JSON.stringify({ type: 'lobbyCreated', lobbyId }));
  const lobby = lobbies.get(lobbyId)
  broadcastToAll({type: 'lobbyAdded', ...parseLobbyInfo(lobby!) });
};

function handleInvite(data: any, client: ClientInfo) {
  const { targetId, lobbyId } = data;
  if (!lobbyId || !targetId) return;
  if (!client.lobbyId || lobbyId != client.lobbyId) return;
  const target = clients.get(targetId);
  if (target) {
    log(`Invite: ${client.id} invited ${targetId} to lobby ${lobbyId}`);
  target.socket.send(JSON.stringify({ type: 'invited', lobbyId, from: client.id }));
  }
};

function handleAcceptInvite(data: any, client: ClientInfo) {
  const { lobbyId } = data;
  if (!lobbyId) return;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    log(`AcceptInvite failed: lobby ${lobbyId} not found for client ${client.id}`);
    return;
  }
  if (lobby.capacity <= lobby.members.size) {
    log(`AcceptInvite failed: lobby ${lobbyId} is full`);
    client.socket.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
    return;
  }
  // Remove client from a lobby if they were in one before
  removeClientFromLobby(client.id);
  lobby.members.add(client.id);
  client.lobbyId = lobbyId;
  client.ready = false;
  log(`Invite accepted: ${id} joined lobby ${lobbyId}`);
  broadcast(lobbyId, { type: 'inviteAccepted', memberId: client.id });
  //broadcastToAll({ type: 'lobbyUpdated', lobby });
};

function handleDeclineInvite(data: any, client: ClientInfo) {
  const { lobbyId } = data;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    log(`DeclineInvite failed: lobby ${lobbyId} not found for client ${client.id}`);
    return;
  }
  log(`Invite declined: ${client.id} declined lobby ${lobbyId}`);
  broadcast(lobbyId, { type: 'inviteDeclined', memberId: client.id });
};

function handleReady(data: any, client: ClientInfo) {
  const { lobbyId, ready } = data;
  if (client.lobbyId !== lobbyId) {
    log(
      `Ready failed: client ${client.id} tried to set ready for lobby ${lobbyId}, but is in lobby ${client.lobbyId}`,
    );
    return;
  }
  client.ready = !!ready;
  log(`Ready state: ${client.id} in lobby ${lobbyId} is now ${!!ready}`);
  broadcast(lobbyId, { type: 'memberReady', memberId: client.id, ready: !!ready });
  checkLobbyReady(lobbyId);
}

console.log(`Matchmaking WebSocket server listening on ${PORT}`);
log(`Server started on port ${PORT}`);

wss.on('connection', (socket: WebSocket) => {
  const id = uuid();
  const client: ClientInfo = { id, socket, ready: false, username: 'Unknown user' };
  clients.set(id, client);
  log(`Client connected: ${id}`);
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));
  broadcastLobbies(client);
  socket.on('message', (raw: RawData) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, raw.toString());
      return;
    }
    const { type, username } = data;
    if (username) client.username = username;
    switch (type) {
      case 'createLobby':
        handleCreateLobby(data, client);
        break;
      case 'invite':
        handleInvite(data, client);
        break;
      case 'acceptInvite':
        handleAcceptInvite(data, client);
        break;
      case 'declineInvite':
        handleDeclineInvite(data, client);
        break;
      case 'ready':
        handleReady(data, client);
        break;
      default:
        client.socket.send(JSON.stringify({ type: 'error', message: 'Unknown message from client' }));
    }
    // Implement switch-case for message types later
   // } else if (type === 'ready') {
    // }
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
