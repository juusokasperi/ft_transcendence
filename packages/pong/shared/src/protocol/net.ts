import type { GameHistoryEntry, MatchSnapshot } from './state';

export type TournamentParticipantMapping = {
  participantId: number;
  userUuid: string;
  alias?: string;
};

export type TournamentContext = {
  tournamentId: number;
  tournamentMatchId: number;
  tournamentStage: 'semifinal' | 'final' | 'bronze';
  participants?: TournamentParticipantMapping[];
};

export type HandoffMessage = {
  type: 'HANDOFF';
  matchId: string;
  roomIdentifier: string;
  gameServerWSUrl: string;
  side: 'west' | 'east';
  joinToken: string;
  joinTokenTTLSeconds: number;
  randomSeed: number;
  simulationStartTick: number;
  tournament?: TournamentContext;
};

export type ConnectedMessage = {
  type: 'CONNECTED';
  clientId: string;
};

export type MatchFoundMessage = {
  type: 'MATCH_FOUND';
  matchId: string;
  opponent: {
    username: string;
    mmr: number;
  };
};

export type MatchDeclinedMessage = {
  type: 'MATCH_DECLINED';
  matchId: string;
};

export type QueueJoinedMessage = {
  type: 'QUEUE_JOINED';
};

export type QueueLeftMessage = {
  type: 'QUEUE_LEFT';
};

export type MatchTimeoutMessage = {
  type: 'MATCH_TIMEOUT';
};

export type HandoffTimeoutMessage = {
  type: 'HANDOFF_TIMEOUT';
  roomIdentifier: string;
  message: string;
};

export type TournamentParticipantState = {
  participantId: number;
  alias: string;
  userUuid: string | null;
  seed: number | null;
  status: string;
};

export type TournamentMatchPlayerState = {
  participantId: number;
  teamNumber: number;
  alias: string;
  status: string;
  score: number | null;
};

export type TournamentMatchState = {
  tournamentMatchId: number;
  roundNumber: number;
  roundPosition: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  matchId: number | null;
  players: TournamentMatchPlayerState[];
};

export type TournamentLobbyUpdatedMessage = {
  type: 'TOURNAMENT_LOBBY_UPDATED';
  tournamentId: number;
  status: string;
  maxParticipants: number | null;
  participants: TournamentParticipantState[];
};

export type TournamentBracketSnapshotMessage = {
  type: 'TOURNAMENT_BRACKET_SNAPSHOT';
  tournamentId: number;
  matches: TournamentMatchState[];
};

export type TournamentMatchesReadyMessage = {
  type: 'TOURNAMENT_MATCHES_READY';
  tournamentId: number;
  matches: Array<{
    tournamentMatchId: number;
    stage: 'semifinal' | 'final' | 'bronze';
    participants: Array<{
      userUuid: string;
      alias: string;
      participantId: number;
      teamNumber: number;
    }>;
  }>;
};

export type TournamentMatchCountdownStatus = 'running' | 'cancelled' | 'started';

export type TournamentMatchCountdownMessage = {
  type: 'TOURNAMENT_MATCH_COUNTDOWN';
  tournamentId: number;
  tournamentMatchId: number;
  stage: 'semifinal' | 'final' | 'bronze';
  // Optional reason for status transitions, used when status === 'cancelled'
  // - 'offline': a player went offline/disconnected
  // - 'forfeited': a player left the tournament (participant forfeited)
  // - 'stopped': manual stop by server logic
  reason?: 'offline' | 'forfeited' | 'stopped';
  secondsRemaining: number;
  targetStartEpochMs: number;
  status: TournamentMatchCountdownStatus;
};

export type OnlineMatchSummary = {
  winner: 'east' | 'west';
  bestOf: number;
  gamesHistory: GameHistoryEntry[];
  names: { east: string; west: string };
  seats?: { east: 'P1' | 'P2'; west: 'P1' | 'P2' };
  mmr: {
    east: { before: number; after: number };
    west: { before: number; after: number };
  };
};

export type ConfirmRequiredMessage = {
  type: 'CONFIRM_REQUIRED';
  message: string;
};

export type MatchmakingMessage =
  | ConnectedMessage
  | QueueJoinedMessage
  | QueueLeftMessage
  | MatchFoundMessage
  | MatchDeclinedMessage
  | HandoffMessage
  | MatchTimeoutMessage
  | HandoffTimeoutMessage
  | InfoMessage
  | TournamentLobbyUpdatedMessage
  | TournamentBracketSnapshotMessage
  | TournamentMatchesReadyMessage
  | TournamentMatchCountdownMessage
  | ConfirmRequiredMessage
  | ErrorMessage;

export type JoinTokenClaims = {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  roomIdentifier: string;
  sub: string;
  side: 'west' | 'east';
  simulationStartTick: number;
  region?: string;
} & Partial<TournamentContext>;

export type ErrorMessage = {
  type: 'ERROR';
  code: string;
  message: string;
};

export type InfoMessage = {
  type: 'INFO';
  message: string;
};

export type JoinQueueRequest = {
  type: 'JOIN_QUEUE';
  preferredSide?: 'west' | 'east';
};

export type LeaveQueueRequest = {
  type: 'LEAVE_QUEUE';
};

export type AcceptMatchRequest = {
  type: 'ACCEPT_MATCH';
  matchId: string;
};

export type DeclineMatchRequest = {
  type: 'DECLINE_MATCH';
  matchId: string;
};

export type TournamentSize = 4 | 8 | 16;

export type CreateTournamentRequest = {
  type: 'CREATE_TOURNAMENT';
  size: TournamentSize;
  name?: string;
};

export type JoinTournamentRequest = {
  type: 'JOIN_TOURNAMENT';
  tournamentId: string;
};

export type LeaveTournamentRequest = {
  type: 'LEAVE_TOURNAMENT';
  tournamentId: string;
};

export type ForfeitTournamentRequest = {
  type: 'FORFEIT_TOURNAMENT';
  tournamentId: string;
};

export type AcceptScheduledRequest = {
  type: 'ACCEPT_SCHEDULED';
  tournamentMatchId: number;
};

export type ConfirmJoinRequest = {
  type: 'CONFIRM_JOIN';
};

export type MatchmakingClientMessage =
  | JoinQueueRequest
  | LeaveQueueRequest
  | AcceptMatchRequest
  | DeclineMatchRequest
  | CreateTournamentRequest
  | JoinTournamentRequest
  | LeaveTournamentRequest
  | ForfeitTournamentRequest
  | AcceptScheduledRequest
  | ConfirmJoinRequest;

export type RoomState = 'WAITING_FOR_OPPONENT' | 'READY' | 'PLAYING';

export type RoomStateMessage = {
  type: 'ROOM_STATE';
  roomIdentifier: string;
  state: RoomState;
  seat?: 'P1' | 'P2';
  startAtEpochMs?: number;
  randomSeed?: number;
  tickRateHz?: number;
  players?: {
    P1?: { alias?: string };
    P2?: { alias?: string };
  };
};

export type StartMessage = {
  type: 'START';
  roomIdentifier: string;
  startAtEpochMs: number;
  randomSeed: number;
  tickRateHz: number;
  players?: {
    P1?: { alias?: string };
    P2?: { alias?: string };
  };
};

export type OpponentDisconnectedMessage = {
  type: 'OPPONENT_DISCONNECTED';
  gracePeriodMs: number;
};

export type OpponentReconnectedMessage = {
  type: 'OPPONENT_RECONNECTED';
};

export type MatchEndReason = 'opponent_timeout' | 'completed' | 'error' | 'forfeit';

export type MatchEndMessage = {
  type: 'MATCH_END';
  reason: MatchEndReason;
  winner?: 'east' | 'west';
  summary?: OnlineMatchSummary | null;
};

export type FrameMessage = {
  type: 'FRAME';
  state: any;
  events: any;
  match: MatchSnapshot;
  /**
   * Authoritative simulation tick index on the server.
   */
  tick: number;
  /**
   * Opponent's scalar input axis at this tick (from the recipient's POV).
   */
  axis?: number;
};

export type ResumeTokenMessage = {
  type: 'RESUME_TOKEN';
  token: string;
};

export type PongMessage = {
  type: 'PONG';
  clientSentAt: number;
  serverReceivedAt: number;
  serverSentAt: number;
};

export type ResumeTokenClaims = {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  roomIdentifier: string;
  sub: string;
  sessionIdentifier: string;
};

export type GameServerControlMessage =
  | FrameMessage
  | RoomStateMessage
  | StartMessage
  | OpponentDisconnectedMessage
  | OpponentReconnectedMessage
  | ResumeTokenMessage
  | MatchEndMessage
  | PongMessage;

// Types that were in blueprint but not implemented:

// export type MatchmakingClientMessage = JoinQueueRequest | ReadyMessage;

// export type ReadyMessage = {
//   type: 'READY';
// };

// export type StartMessage = {
//   type: 'START';
//   startTick: number;
// };

// export type InputMessage = {
//   type: 'INPUT';
//   tick: number;
//   axis: number;
// };

// export type SnapShotMessage = {
//   type: 'SNAPSHOT';
//   tick: number;
//   state: any; // ??
// };

// export type EndMessage = {
//   type: 'END';
//   reason: 'completed' | 'forfeit' | 'disconnect';
//   winner?: 'west' | 'east';
// };

// export type GameServerClientMessage =
//   | StartMessage
//   | InputMessage
//   | SnapShotMessage
//   | EndMessage
//   | MatchHandoff
//   | PongMessage;
