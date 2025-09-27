import type { WebSocket } from 'ws';

export interface ClientInfo {
  id: string;
  mmr: number;
  socket: WebSocket;
  username: string;
  lobbyId?: string;
  ready: boolean;
  uuid: string;
  authenticated: boolean;
  joinedAt: number;
}

// export interface Lobby {
//   id: string;
//   members: Set<string>;
//   timeout: NodeJS.Timeout;
//   hostName: string;
//   capacity: number;
// }

// Old version
// export type MatchmakingClientMessage =
//   | { type: 'createLobby'; username: string }
//   | { type: 'invite'; targetId: string; lobbyId: string }
//   | { type: 'acceptInvite'; lobbyId: string }
//   | { type: 'declineInvite'; lobbyId: string }
//   | { type: 'ready'; lobbyId: string; ready: boolean };

// export interface LobbyInfo {
//   lobbyId: string;
//   hostName: string;
//   capacity: number;
//   membersCount: number;
// }

export interface PendingMatch {
  a: ClientInfo;
  b: ClientInfo;
  accepted: Set<string>;
  timer: NodeJS.Timeout;
}
