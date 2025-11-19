import type { WebSocket } from 'ws';

export enum ClientState {
  IDLE,
  IN_QUEUE,
  PENDING_MATCH_ACCEPTANCE,
  IN_TOURNAMENT,
  IN_INVITE_LOBBY,
  AWAITING_HANDOFF,
  HANDOFF_TO_GAME,
}

export interface ClientInfo {
  id: string;
  mmr: number;
  socket: WebSocket;
  username: string;
  tournamentId?: number;
  tournamentParticipantId?: number;
  siteToken?: string;
  ready: boolean;
  uuid: string;
  authenticated: boolean;
  joinedAt: number;
  lastRateLimitNotice: number;
  state: ClientState;
  previousState: ClientState | undefined;
}

export interface PendingMatch {
  a: ClientInfo;
  b: ClientInfo;
  accepted: Set<string>;
  timer: NodeJS.Timeout;
}

export interface InviteLobby {
  lobbyId: string;
  player1Uuid: string;
  player2Uuid: string;
  player1Client?: ClientInfo;
  player2Client?: ClientInfo;
  createdAt: number;
  timer?: NodeJS.Timeout;
}

export type MatchMode = 'ranked' | 'tournament' | 'invite';
