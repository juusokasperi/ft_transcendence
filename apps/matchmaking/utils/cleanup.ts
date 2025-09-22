import type { ClientInfo, Lobby } from '../types/types.ts';
import { broadcastToAll } from './broadcast.ts';
import { parseLobbyInfo } from './handlers.ts';

export function cleanupLobby(id: string, lobbies: Map<string, Lobby>, clients: Map<string, ClientInfo>) {
  const lobby = lobbies.get(id);
  if (!lobby) return;
  clearTimeout(lobby.timeout);
  lobbies.delete(id);
  broadcastToAll({ type: 'lobbyRemoved', lobbyId: lobby.id }, clients);
};

export function removeClient(id: string, lobbies: Map<string, Lobby>, clients: Map<string, ClientInfo>) {
  const client = clients.get(id);
  if (!client) return;
  const lobbyId = client.lobbyId;
  clients.delete(id);
  if (lobbyId) {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.members.delete(id);
      //broadcast(lobbyId, { type: 'memberLeft', memberId: id });
      if (!lobby.members.size) cleanupLobby(lobbyId, lobbies, clients);
      else broadcastToAll({ type: 'lobbyUpdated', lobby: parseLobbyInfo(lobby) }, clients);
    }
  }
};

export function removeClientFromLobby(id: string, lobbies: Map<string, Lobby>, clients: Map<string, ClientInfo>) {
  const client = clients.get(id);
  if (!client) return;
  const lobbyId = client.lobbyId;
  if (lobbyId) {
    client.lobbyId = undefined;
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.members.delete(id);
      //broadcast(lobbyId, { type: 'memberLeft', memberId: id });
      if (!lobby.members.size) cleanupLobby(lobbyId, lobbies, clients);
      else broadcastToAll({ type: 'lobbyUpdated', lobby: parseLobbyInfo(lobby) }, clients);
    }
  }
};
