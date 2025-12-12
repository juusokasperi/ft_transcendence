import type { WebSocket } from 'ws';

/**
 * States a matchmaking client can be in while connected to the service.
 */
export enum ClientState {
  IDLE,
  IN_QUEUE,
  PENDING_MATCH_ACCEPTANCE,
  IN_TOURNAMENT,
  IN_INVITE_LOBBY,
  AWAITING_HANDOFF,
  HANDOFF_TO_GAME,
}

/**
 * In-memory representation of a connected matchmaking client.
 *
 * This is held only in the matchmaking process; persistence and auth are handled
 * by other services. It tracks:
 *  - identity and auth (uuid, username, authenticated, siteToken),
 *  - rating (mmr),
 *  - connection state (socket, joinedAt, state/previousState),
 *  - tournament context when applicable.
 */
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

/**
 * Pending match between two clients awaiting mutual acceptance.
 */
export interface PendingMatch {
  a: ClientInfo;
  b: ClientInfo;
  accepted: Set<string>;
  timer: NodeJS.Timeout;
}

/**
 * Invite lobby metadata used for invite-only matches.
 *
 * Tracks which players are involved, which clients (sockets) are currently
 * attached, and a timer for lobby timeout.
 */
export interface InviteLobby {
  lobbyId: string;
  player1Uuid: string;
  player2Uuid: string;
  player1Client?: ClientInfo;
  player2Client?: ClientInfo;
  createdAt: number;
  timer?: NodeJS.Timeout;
}

/** Supported match modes for matchmaking and allocator/gateway flows. */
export type MatchMode = 'ranked' | 'tournament' | 'invite';
