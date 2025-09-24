import { parseLobbyInfo } from './handlers.ts';
import type { Lobby, ClientInfo } from '../types/types.ts';

export function broadcastLobbies(
  clientTo: ClientInfo,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  const openLobbies = Array.from(lobbies.values()).map((lobby) => parseLobbyInfo(lobby));
  const msg = JSON.stringify({ type: 'lobbyList', lobbies: openLobbies });
  if (clientTo) {
    clientTo.socket.send(msg);
  } else {
    clients.forEach((client) => {
      client.socket.send(msg);
    });
  }
}

export function broadcastToAll(data: any, clients: Map<string, ClientInfo>) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    client.socket.send(msg);
  });
}

export function broadcast(
  lobbyId: string,
  data: any,
  lobbies: Map<string, Lobby>,
  clients: Map<string, ClientInfo>,
) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const msg = JSON.stringify(data);
  lobby.members.forEach((id) => {
    const c = clients.get(id);
    c?.socket.send(msg);
  });
}
