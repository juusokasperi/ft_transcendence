import type { WebSocket } from 'ws';

export interface ClientInfo {
  id: string;
  mmr: number;
  socket: WebSocket;
  username: string;
  tournamentId?: string;
  ready: boolean;
  uuid: string;
  authenticated: boolean;
  joinedAt: number;
}

export interface PendingMatch {
  a: ClientInfo;
  b: ClientInfo;
  accepted: Set<string>;
  timer: NodeJS.Timeout;
}

export type MatchMode = 'ranked' | 'tournament' | 'invite';
