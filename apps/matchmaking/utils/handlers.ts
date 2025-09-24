import type { ClientInfo, Lobby, MatchmakingClientMessage, LobbyInfo, PendingMatch } from '../types/types.ts';
import { GAME_SERVER_URL, LOBBY_TTL_MS, LOBBY_SIZE } from './config.ts';
import { log } from './log.ts';
import { broadcastToAll, broadcast } from './broadcast.ts';
import { v4 as uuid } from 'uuid';
import { cleanupLobby, removeClientFromLobby } from './cleanup.ts';
import { verifySiteToken, fetchUserMMR } from './auth.ts';
import { tryMatchQueue } from './queue.ts';

export function checkLobbyReady(
  lobbyId: string,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
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
    cleanupLobby(lobbyId, lobbies, clients);
  }
}

export function handleCreateLobby(
  data: MatchmakingClientMessage,
  client: ClientInfo,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  if (!isAuthenticated(client)) return;
  if (data.type !== 'createLobby') return;
  const { username } = data;
  client.username = username;
  const lobbyId = uuid();
  const timeout = setTimeout(() => cleanupLobby(lobbyId, lobbies, clients), LOBBY_TTL_MS);
  lobbies.set(lobbyId, {
    id: lobbyId,
    members: new Set([client.id]),
    timeout,
    hostName: client.username,
    capacity: LOBBY_SIZE,
  });
  log(`Lobby created: ${lobbyId} by ${client.id} / ${client.username}`);
  client.lobbyId = lobbyId;
  client.ready = false;
  client.socket.send(JSON.stringify({ type: 'lobbyCreated', lobbyId }));
  const lobby = lobbies.get(lobbyId);
  broadcastToAll({ type: 'lobbyAdded', lobby: parseLobbyInfo(lobby!) }, clients);
}

export function handleInvite(
  data: MatchmakingClientMessage,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!isAuthenticated(client)) return;
  if (data.type !== 'invite') return;
  const { targetId, lobbyId } = data;
  if (!lobbyId || !targetId) return;
  if (!client.lobbyId || lobbyId != client.lobbyId) return;
  const target = clients.get(targetId);
  if (target) {
    log(`Invite: ${client.id} invited ${targetId} to lobby ${lobbyId}`);
    target.socket.send(JSON.stringify({ type: 'invited', lobbyId, from: client.id }));
  }
}

export function handleAcceptInvite(
  data: MatchmakingClientMessage,
  client: ClientInfo,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  if (!isAuthenticated(client)) return;
  if (data.type !== 'acceptInvite') return;
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
  removeClientFromLobby(client.id, lobbies, clients);
  lobby.members.add(client.id);
  client.lobbyId = lobbyId;
  client.ready = false;
  log(`Invite accepted: ${client.id} joined lobby ${lobbyId}`);
  broadcast(lobbyId, { type: 'inviteAccepted', memberId: client.id }, lobbies, clients);
  broadcastToAll({ type: 'lobbyUpdated', lobby: parseLobbyInfo(lobby) }, clients);
}

export function handleDeclineInvite(
  data: MatchmakingClientMessage,
  client: ClientInfo,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  if (!isAuthenticated(client)) return;
  if (data.type !== 'declineInvite') return;
  const { lobbyId } = data;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    log(`DeclineInvite failed: lobby ${lobbyId} not found for client ${client.id}`);
    return;
  }
  log(`Invite declined: ${client.id} declined lobby ${lobbyId}`);
  broadcast(lobbyId, { type: 'inviteDeclined', memberId: client.id }, lobbies, clients);
}

export function handleReady(
  data: MatchmakingClientMessage,
  client: ClientInfo,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  if (!isAuthenticated(client)) return;
  if (data.type !== 'ready') return;
  const { lobbyId, ready } = data;
  if (client.lobbyId !== lobbyId) {
    log(
      `Ready failed: client ${client.id} tried to set ready for lobby ${lobbyId}, but is in lobby ${client.lobbyId}`,
    );
    return;
  }
  client.ready = !!ready;
  log(`Ready state: ${client.id} in lobby ${lobbyId} is now ${!!ready}`);
  broadcast(
    lobbyId,
    { type: 'memberReady', memberId: client.id, ready: !!ready },
    lobbies,
    clients,
  );
  checkLobbyReady(lobbyId, lobbies, clients);
}

export function parseLobbyInfo(lobby: Lobby): LobbyInfo {
  return {
    lobbyId: lobby.id,
    hostName: lobby.hostName,
    capacity: lobby.capacity,
    membersCount: lobby.members.size,
  };
};

export async function handleAuth(client: ClientInfo, token: string): Promise<boolean> {
  log(`Handle auth and token is ${token}`);
  const user = await verifySiteToken(token);
  if (!user) {
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Invalid token'}));
    client.socket.close();
    return false;
  }
  const mmr = await fetchUserMMR(user.uuid, token);
  if (typeof mmr !== 'number') {
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'MMR not found' }));
    client.socket.close();
    return false;
  }
  client.username = user.username;
  client.uuid = user.uuid;
  client.authenticated = true;
  client.mmr = mmr;
  return true;
};

export async function handleJoinQueue(client: ClientInfo, queue: ClientInfo[]) {
  if (!isAuthenticated(client))
    return;
  client.joinedAt = Date.now();
  queue.push(client);
  client.socket.send(JSON.stringify({ type: 'QUEUE_JOINED' }));
};

function isAuthenticated(client: ClientInfo): Boolean {
  if (!client.authenticated)
    client.socket.send({ type: 'ERROR', code: 'AUTH', message: 'Not authenticated' });
  return (client.authenticated);
};
